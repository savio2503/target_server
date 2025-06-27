import axios from 'axios'; 

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
        } catch (error) {
            console.error(`Erro ao converter URL para Base64: ${imageUrl}`, error.message);
            throw new Error('Não foi possível baixar ou converter a imagem da URL.');
        }
    }
}
export default ImageConverter;