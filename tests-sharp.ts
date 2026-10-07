import sharp from 'sharp';

async function test() {
    console.log("Sharp version:", sharp.versions?.vips || "unknown");
}
test().catch(console.error);
