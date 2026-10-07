const sharp = require('sharp');
async function run() {
    const pngBuffer = await sharp({
        create: {
            width: 100,
            height: 100,
            channels: 4,
            background: { r: 0, g: 0, b: 0, alpha: 0 }
        }
    }).png().toBuffer();
    
    const output = await sharp(pngBuffer)
        .resize(50, 50)
        .toBuffer();
        
    const metadata = await sharp(output).metadata();
    console.log('Output format:', metadata.format);
}
run();
