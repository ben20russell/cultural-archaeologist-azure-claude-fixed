import fs from 'fs';
import sharp from 'sharp';

const W = 1200;
const H = 630;
const FONT = 'system-ui, -apple-system, Segoe UI, Avenir Next, sans-serif';

let out = '';
out += `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" fill="none">\n`;
out += `<defs>\n`;
out += `<linearGradient id="bg" x1="0" y1="0" x2="${W}" y2="${H}" gradientUnits="userSpaceOnUse">`;
out += `<stop offset="0" stop-color="#F7F8FA"/>`;
out += `<stop offset="1" stop-color="#EEF3F7"/>`;
out += `</linearGradient>\n`;
out += `<radialGradient id="blobA" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(180 88) rotate(12) scale(560 320)">`;
out += `<stop offset="0" stop-color="#99D7FF" stop-opacity="0.30"/>`;
out += `<stop offset="1" stop-color="#99D7FF" stop-opacity="0"/>`;
out += `</radialGradient>\n`;
out += `<radialGradient id="blobB" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(1020 120) rotate(-12) scale(620 340)">`;
out += `<stop offset="0" stop-color="#FFD08A" stop-opacity="0.30"/>`;
out += `<stop offset="1" stop-color="#FFD08A" stop-opacity="0"/>`;
out += `</radialGradient>\n`;
out += `<radialGradient id="blobC" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(920 522) rotate(-8) scale(620 260)">`;
out += `<stop offset="0" stop-color="#9AE7C5" stop-opacity="0.22"/>`;
out += `<stop offset="1" stop-color="#9AE7C5" stop-opacity="0"/>`;
out += `</radialGradient>\n`;
out += `<linearGradient id="brandGradient" x1="500" y1="0" x2="1110" y2="0">`;
out += `<stop offset="0" stop-color="#0EA5E9"/>`;
out += `<stop offset="1" stop-color="#F59E0B"/>`;
out += `</linearGradient>\n`;
out += `<linearGradient id="iconGradient" x1="0" y1="0" x2="1" y2="1">`;
out += `<stop offset="0" stop-color="#0284C7"/>`;
out += `<stop offset="0.55" stop-color="#0EA5E9"/>`;
out += `<stop offset="1" stop-color="#F59E0B"/>`;
out += `</linearGradient>\n`;
out += `<filter id="noise" x="0" y="0" width="${W}" height="${H}">`;
out += `<feTurbulence type="fractalNoise" baseFrequency="0.82" numOctaves="1" seed="6" result="noise"/>`;
out += `<feComponentTransfer><feFuncA type="table" tableValues="0 0 0.014 0.03"/></feComponentTransfer>`;
out += `</filter>\n`;
out += `</defs>\n`;

out += `<rect width="${W}" height="${H}" fill="url(#bg)"/>\n`;
out += `<rect width="${W}" height="${H}" fill="url(#blobA)"/>\n`;
out += `<rect width="${W}" height="${H}" fill="url(#blobB)"/>\n`;
out += `<rect width="${W}" height="${H}" fill="url(#blobC)"/>\n`;

// Transparent-background magnifying glass icon.
out += `<circle cx="600" cy="158" r="19" stroke="url(#iconGradient)" stroke-width="7" fill="none"/>\n`;
out += `<line x1="614" y1="172" x2="632" y2="190" stroke="url(#iconGradient)" stroke-width="7" stroke-linecap="round"/>\n`;

// Header copy (main-page look and feel).
out += `<text x="130" y="302" font-family="${FONT}" font-size="108" font-weight="600" letter-spacing="-2.4" fill="#0F172A">Cultural</text>\n`;
out += `<text x="508" y="302" font-family="${FONT}" font-size="108" font-weight="600" letter-spacing="-2.4" fill="url(#brandGradient)">Archeologist</text>\n`;

// Descriptor text for sharing cards.
out += `<text x="600" y="376" text-anchor="middle" font-family="${FONT}" font-size="38" font-weight="540" fill="#374151">Decode audiences, culture, and brand identity in minutes.</text>\n`;
out += `<text x="600" y="430" text-anchor="middle" font-family="${FONT}" font-size="29" font-weight="500" fill="#6B7280">AI-assisted cultural intelligence and visual deep dives.</text>\n`;

// Subtle frame.
out += `<rect x="36" y="34" width="1128" height="562" rx="34" stroke="#CBD5E1" stroke-opacity="0.56" fill="none"/>\n`;

// Bottom soft atmospheric sweep for depth.
out += `<ellipse cx="600" cy="602" rx="560" ry="96" fill="#FFFFFF" fill-opacity="0.38"/>\n`;
out += `<rect width="${W}" height="${H}" filter="url(#noise)" opacity="0.62"/>\n`;
out += `</svg>\n`;

fs.writeFileSync('public/social-preview.svg', out);
await sharp(Buffer.from(out)).png({ compressionLevel: 9, quality: 92 }).toFile('public/social-preview.png');
console.log('Generated public/social-preview.svg and public/social-preview.png');
