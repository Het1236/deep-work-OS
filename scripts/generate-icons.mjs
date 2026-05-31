import sharp from 'sharp'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const pub = join(here, '..', 'public')
const svg = readFileSync(join(pub, 'app-icon.svg'))

const targets = [
  [192, 'icon-192.png'],
  [512, 'icon-512.png'],
  [512, 'icon-maskable-512.png'],
  [180, 'apple-touch-icon.png'],
]

for (const [size, name] of targets) {
  await sharp(svg).resize(size, size).png().toFile(join(pub, name))
  console.log('wrote', name)
}
