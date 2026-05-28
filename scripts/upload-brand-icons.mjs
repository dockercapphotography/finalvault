#!/usr/bin/env node
// Run from your finalvault repo root: node scripts/upload-brand-icons.js

import { execSync } from 'child_process'
import { writeFileSync, readFileSync, mkdirSync, rmSync } from 'fs'
import { join } from 'path'

const ICONS = [
  { id: 'instagram', color: '#E1306C', label: 'Instagram' },
  { id: 'facebook',  color: '#1877F2', label: 'Facebook'  },
  { id: 'tiktok',    color: '#000000', label: 'TikTok'    },
  { id: 'x',         color: '#000000', label: 'X'         },
  { id: 'youtube',   color: '#FF0000', label: 'YouTube'   },
  { id: 'pinterest', color: '#E60023', label: 'Pinterest' },
  { id: 'venmo',     color: '#008CFF', label: 'Venmo'     },
  { id: 'paypal',    color: '#003087', label: 'PayPal'    },
  { id: 'kofi',      color: '#FF5E5B', label: 'Ko-Fi'     },
  { id: 'cashapp',   color: '#00D632', label: 'Cash App'  },
]

const TMPDIR = join('/tmp', `brand-icons-${Date.now()}`)
mkdirSync(TMPDIR, { recursive: true })

async function downloadSvg(id) {
  const res = await fetch(`https://simpleicons.org/icons/${id}.svg`)
  if (!res.ok) throw new Error(`Failed to download ${id}: ${res.status}`)
  return res.text()
}

function colorizeAndWrap(svgContent, color) {
  // Strip the outer <svg> tag, get just the inner paths
  const inner = svgContent
    .replace(/<svg[^>]*>/, '')
    .replace(/<\/svg>/, '')
    .replace(/fill="[^"]*"/g, '')
    .trim()

  // Wrap in a 48x48 with rounded background + colored icon centered
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="48" height="48">
  <rect width="48" height="48" rx="10" fill="${color}" fill-opacity="0.12"/>
  <g transform="translate(12,12)" fill="${color}">
    ${inner}
  </g>
</svg>`
}

async function convertToPng(svgPath, pngPath) {
  execSync(`rsvg-convert -w 48 -h 48 "${svgPath}" -o "${pngPath}"`)
}


async function main() {
  const outDir = join(process.cwd(), 'public', 'brand-icons')
  mkdirSync(outDir, { recursive: true })
  console.log(`Saving icons to ${outDir}\n`)

  for (const icon of ICONS) {
    process.stdout.write(`${icon.label}... `)
    try {
      const svgContent = await downloadSvg(icon.id)
      const colored = colorizeAndWrap(svgContent, icon.color)

      const svgPath = join(TMPDIR, `${icon.id}.svg`)
      const pngPath = join(outDir, `${icon.id}.png`)

      writeFileSync(svgPath, colored)
      await convertToPng(svgPath, pngPath)

      console.log('✓')
    } catch (err) {
      console.log(`✗ ${err.message}`)
    }
  }

  rmSync(TMPDIR, { recursive: true, force: true })
  console.log('\nDone! Icons saved to public/brand-icons/')
  console.log('Commit and push to deploy them to production.')
}

main()
