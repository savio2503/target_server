import axios from 'axios'
import sharp from 'sharp'
import { promises as dns } from 'node:dns'
import net from 'node:net'

class ImageConverter {
  /**
   * Verifica se a string é uma URL válida com protocolo http ou https.
   */
  static isURL(str: string): boolean {
    try {
      const parsed = new URL(str)
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
   */
  static async convertUrlToBase64(imageUrl: string): Promise<string> {
    if (!this.isURL(imageUrl)) {
      throw new Error('URL de imagem inválida ou protocolo não permitido.')
    }

    const parsedUrl = new URL(imageUrl)

    // Previne SSRF resolvendo o hostname e validando o IP antes de conectar
    try {
      const lookupResult = await dns.lookup(parsedUrl.hostname, { all: true })
      for (const entry of lookupResult) {
        if (this.isPrivateOrReservedIP(entry.address)) {
          throw new Error('Acesso a endereços de rede privada ou reservada bloqueado.')
        }
      }
    } catch (err: any) {
      throw new Error(`Falha ao resolver host da imagem: ${err.message}`)
    }

    try {
      const response = await axios.get(imageUrl, {
        responseType: 'arraybuffer',
        timeout: 7000,
        maxContentLength: 10 * 1024 * 1024, // Limite de 10MB para download
        maxRedirects: 3,
        headers: {
          Accept: 'image/jpeg,image/png,image/webp,image/gif,*/*',
        },
      })

      const contentType = response.headers['content-type']
      if (contentType && !contentType.toLowerCase().startsWith('image/')) {
        throw new Error('A URL fornecida não retornou um tipo de imagem válido.')
      }

      const base64Image = Buffer.from(response.data).toString('base64')
      return base64Image
    } catch (error: any) {
      console.error(`Erro ao converter URL para Base64: ${imageUrl}`, error.message)
      throw new Error('Não foi possível baixar ou converter a imagem da URL com segurança.')
    }
  }

  /**
   * Comprime uma imagem base64 usando o sharp.
   */
  static async compressBase64(base64: string): Promise<string> {
    try {
      let pureBase64 = base64
      const match = base64.match(/^data:(?:image\/[a-zA-Z0-9.+]+);base64,(.+)$/)
      if (match) {
        pureBase64 = match[1]
      }

      let buffer = Buffer.from(pureBase64, 'base64')

      // Comprime apenas se for maior que 1MB (aproximadamente)
      if (buffer.length > 1024 * 1024) {
        buffer = await sharp(buffer)
          .resize({ width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true })
          .toBuffer()
      }

      return buffer.toString('base64')
    } catch (error) {
      console.error('Erro ao comprimir imagem base64:', error)
      return base64
    }
  }
}

export default ImageConverter
