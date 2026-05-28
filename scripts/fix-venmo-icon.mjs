#!/usr/bin/env node
// Run from finalvault repo root: node scripts/fix-venmo-icon.mjs

import { execSync } from 'child_process'
import { writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'

const outDir = join(process.cwd(), 'public', 'brand-icons')
mkdirSync(outDir, { recursive: true })

// Venmo V mark from Font Awesome, scaled and centered on branded background
const venmoSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="48" height="48">
  <rect width="48" height="48" rx="10" fill="#008CFF" fill-opacity="0.12"/>
  <g transform="translate(8,8) scale(0.05)">
    <path fill="#008CFF" d="M530.5 78.8C547.9 107.5 555.8 137 555.8 174.3C555.8 293.3 453.9 447.8 371.1 556.4L182.2 556.4L106.4 104.9L271.8 89.2L311.9 410.5C349.3 349.7 395.5 254.2 395.5 189.1C395.5 153.5 389.4 129.2 379.8 109.2L530.5 78.8z"/>
  </g>
</svg>`

const svgPath = '/tmp/venmo_fixed.svg'
const pngPath = join(outDir, 'venmo.png')

writeFileSync(svgPath, venmoSvg)
execSync(`rsvg-convert -w 48 -h 48 "${svgPath}" -o "${pngPath}"`)
console.log('✓ Venmo icon regenerated at', pngPath)
