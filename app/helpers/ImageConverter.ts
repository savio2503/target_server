import axios from 'axios'
import sharp from 'sharp'
import { promises as dns } from 'node:dns'
import net from 'node:net'

class ImageConverter {
  /**
   * Verifica se a string é uma URL válida com protocolo http ou https.
   */
  static isURL(str: string): boolean {
    if (!str || typeof str !== 'string') return false
    const trimmed = str.trim()
    try {
      const parsed = new URL(trimmed)
      return parsed.protocol === 'http:' || parsed.protocol === 'https:'
    } catch (e) {
      return false
    }
  }

  /**
   * Checa se um endereço IP (IPv4 ou IPv6) é de rede privada, local ou reservada.
   */
  static isPrivateOrReservedIP(ip: string): boolean {
    if (!net.isIP(ip)) return true

    // Normaliza IPv4 mapeado em IPv6 (ex: ::ffff:127.0.0.1)
    if (ip.startsWith('::ffff:')) {
      ip = ip.substring(7)
    }

    if (net.isIPv4(ip)) {
      const parts = ip.split('.').map(Number)
      const [a, b] = parts

      if (a === 127) return true // Loopback
      if (a === 10) return true // Private Class A
      if (a === 172 && b >= 16 && b <= 31) return true // Private Class B
      if (a === 192 && b === 168) return true // Private Class C
      if (a === 169 && b === 254) return true // Link-local / Cloud metadata (AWS/GCP/Azure)
      if (a === 0 || a >= 224) return true // Reservado / Multicast
      return false
    }

    if (net.isIPv6(ip)) {
      const lower = ip.toLowerCase()
      if (lower === '::1' || lower === '::') return true // Loopback / unspecified
      if (lower.startsWith('fe80:')) return true // Link-local
      if (lower.startsWith('fc') || lower.startsWith('fd')) return true // Unique local (fc00::/7)
      return false
    }

    return true
  }

  /**
   * Converte uma URL de imagem para Base64 com proteção rigorosa contra SSRF e DoS.
   * Utiliza headers de navegador real para evitar bloqueios HTTP 403 (ex: Wikimedia).
   */
  static async convertUrlToBase64(imageUrl: string): Promise<string> {
    if (!this.isURL(imageUrl)) {
      throw new Error('URL de imagem inválida ou protocolo não permitido.')
    }

    const trimmedUrl = imageUrl.trim()
    const parsedUrl = new URL(trimmedUrl)

    // Previne SSRF resolvendo o hostname e validando o IP antes de conectar
    try {
      const lookupResult = await dns.lookup(parsedUrl.hostname, { all: true })
      for (const entry of lookupResult) {
        if (this.isPrivateOrReservedIP(entry.address)) {
          throw new Error('Acesso a endereços de rede privada ou reservada bloqueado.')
        }
      }
    } catch (err: any) {
      throw new Error(`Falha ao resolver host da imagem (${parsedUrl.hostname}): ${err.message}`)
    }

    try {
      const response = await axios.get(trimmedUrl, {
        responseType: 'arraybuffer',
        timeout: 10000,
        maxContentLength: 15 * 1024 * 1024, // Limite de 15MB para download
        maxRedirects: 5,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
          'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
          'Sec-Ch-Ua': '"Chromium";v="124", "Google Chrome";v="124"',
          'Sec-Ch-Ua-Mobile': '?0',
          'Sec-Ch-Ua-Platform': '"Windows"',
        },
      })

      const contentType = response.headers['content-type']
      if (contentType && !contentType.toLowerCase().startsWith('image/')) {
        throw new Error(`A URL fornecida retornou content-type inválido (${contentType}).`)
      }

      const buffer = Buffer.from(response.data)
      if (buffer.length === 0) {
        throw new Error('A imagem baixada da URL está vazia.')
      }

      // Validação de integridade: garante que o Sharp consegue ler metadados
      const metadata = await sharp(buffer).metadata()
      if (!metadata.format) {
        throw new Error('O conteúdo baixado não é um formato de imagem reconhecido.')
      }

      return buffer.toString('base64')
    } catch (error: any) {
      const statusInfo = error.response?.status ? ` (HTTP ${error.response.status})` : ''
      const detail = error.message || ''
      console.error(`[ImageConverter] Erro ao baixar URL ${trimmedUrl}${statusInfo}: ${detail}`)
      throw new Error(
        `Não foi possível baixar ou validar a imagem da URL fornecida${statusInfo}. Verifique se o link é direto e acessível.`
      )
    }
  }

  /**
   * Comprime uma imagem base64 usando o sharp caso seja maior que 1MB.
   * Não altera a entrada caso seja URL ou base64 inválido.
   */
  static async compressBase64(base64: string): Promise<string> {
    if (!base64 || typeof base64 !== 'string') {
      return base64
    }

    // Se for URL, preserva a URL intacta
    if (this.isURL(base64)) {
      return base64
    }

    try {
      let pureBase64 = base64
      const match = base64.match(/^data:(?:image\/[a-zA-Z0-9.+]+);base64,(.+)$/)
      if (match) {
        pureBase64 = match[1]
      }

      if (pureBase64.length < 50) {
        return base64
      }

      let buffer = Buffer.from(pureBase64, 'base64')

      // Valida com sharp se é realmente uma imagem suportada antes de tocar nela
      const metadata = await sharp(buffer).metadata()
      if (!metadata.format) {
        return base64
      }

      // Comprime apenas se for maior que 1MB (aproximadamente)
      if (buffer.length > 1024 * 1024) {
        buffer = await sharp(buffer)
          .resize({ width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true })
          .toBuffer()
        return buffer.toString('base64')
      }

      return base64
    } catch {
      // Se não for uma imagem válida ou falhar, mantém a string original sem corrompê-la
      return base64
    }
  }
}

export default ImageConverter
