/**
 * Converte um parâmetro de offset UTC/GMT para minutos.
 * Suporta formatos como:
 * - Inteiros ou decimais em horas: "-3", "3", "+3", "-3.5", "5.5"
 * - Formato ISO de offset: "-03:00", "+02:00", "-0300", "+0200"
 * - Prefixos UTC/GMT: "UTC-3", "GMT+2", "GMT-03:00"
 * - Minutos diretos: "-180", "180"
 * 
 * Se o parâmetro for nulo, indefinido ou vazio, retorna -180 (GMT-3 padrão) para manter compatibilidade.
 * Retorna null se for um formato inválido.
 */
export function parseUtcOffsetMinutes(utc?: string | number | null): number | null {
  if (utc === undefined || utc === null || utc === '') {
    return -180
  }

  let str = String(utc).trim()
  try {
    str = decodeURIComponent(str).trim()
  } catch {
    // mantém o valor original se falhar o decode
  }
  str = str.replace(/^(UTC|GMT)/i, '').trim()

  // Formato com dois pontos: +03:00, -03:00, 03:00
  const colonMatch = str.match(/^([+-])?(\d{1,2}):(\d{2})$/)
  if (colonMatch) {
    const sign = colonMatch[1] === '-' ? -1 : 1
    const hours = parseInt(colonMatch[2], 10)
    const mins = parseInt(colonMatch[3], 10)
    return sign * (hours * 60 + mins)
  }

  // Formato com 4 dígitos: +0300, -0300
  const fourDigitMatch = str.match(/^([+-])(\d{2})(\d{2})$/)
  if (fourDigitMatch) {
    const sign = fourDigitMatch[1] === '-' ? -1 : 1
    const hours = parseInt(fourDigitMatch[2], 10)
    const mins = parseInt(fourDigitMatch[3], 10)
    return sign * (hours * 60 + mins)
  }

  // Formato numérico simples: -3, 3, +3, -3.5, 5.5, -180, 180
  const num = Number(str)
  if (!isNaN(num)) {
    if (Math.abs(num) <= 14) {
      return Math.round(num * 60)
    }
    return Math.round(num)
  }

  return null
}

