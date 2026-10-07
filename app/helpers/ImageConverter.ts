import axios from 'axios'; 
import sharp from 'sharp';

class ImageConverter {

   /**
   * Verifica se a string é uma URL válida.
   * @param {string} str
   * @returns {boolean}
   */
    static isURL(str: string): boolean {
        try {
            new URL(str);
            return true;
        } catch (e) {
            return false;
        }
    }

   /**
    * Converte uma URL de imagem para Base64.
    * @param {string} imageUrl
    * @returns {Promise<string>} Base64 da imagem
    * @throws {Error} Se a imagem não puder ser baixada ou convertida
    */
    static async convertUrlToBase64(imageUrl: string): Promise<string> {
        try {
            const response = await axios.get(imageUrl, {
                responseType: 'arraybuffer' // Recebe a resposta como um buffer de bytes
            });

            const base64Image = Buffer.from(response.data).toString('base64');

            // **AQUI: Retorna apenas a string Base64 sem o prefixo**
            return base64Image;
        } catch (error: any) {
            console.error(`Erro ao converter URL para Base64: ${imageUrl}`, error.message);
            throw new Error('Não foi possível baixar ou converter a imagem da URL.');
        }
    }

    /**
     * Comprime uma imagem base64 usando o sharp.
     * @param {string} base64
     * @returns {Promise<string>}
     */
    static async compressBase64(base64: string): Promise<string> {
        try {
            let pureBase64 = base64;
            let prefix = '';
            const match = base64.match(/^data:(image\/[a-zA-Z0-9.+]+);base64,(.+)$/);
            if (match) {
                prefix = `data:${match[1]};base64,`;
                pureBase64 = match[2];
            }

            let buffer = Buffer.from(pureBase64, 'base64');

            // Comprime apenas se for maior que 1MB (aproximadamente)
            if (buffer.length > 1024 * 1024) {
                buffer = await sharp(buffer)
                    .resize({ width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true })
                    .toBuffer();
            }

            return buffer.toString('base64');
        } catch (error) {
            console.error('Erro ao comprimir imagem base64:', error);
            // Em caso de erro, retorna a string original
            return base64;
        }
    }
}
export default ImageConverter;