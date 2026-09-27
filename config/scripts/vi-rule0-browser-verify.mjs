// RULE-0 browser verification for the vi locale: attaches over CDP to a running
// dev instance (launch it with ORCA_BACKGROUND_LAUNCH=1 REMOTE_DEBUGGING_PORT=…),
// drives Settings → Appearance → Language → Tiếng Việt through the real UI,
// then captures screenshots and scans for raw catalog keys / GT-literal terms.
// Usage: node config/scripts/vi-rule0-browser-verify.mjs --port 9333 --out <dir>
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

import { chromium } from 'playwright-core'

function parseArgs(argv) {
  const args = { port: 9333, out: 'docs/superpowers/evidence/sf-2-catalog-vi' }
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--port' && argv[index + 1]) {
      args.port = Number(argv[index + 1])
    }
    if (argv[index] === '--out' && argv[index + 1]) {
      args.out = argv[index + 1]
    }
    // Why: re-running against a profile already switched to vi — skip the picker
    // interaction and go straight to capture + scans.
    if (argv[index] === '--skip-switch') {
      args.skipSwitch = true
    }
    // Why: flip an already-vi profile back to English so the en→vi switch is real.
    if (argv[index] === '--reset-en') {
      args.resetEn = true
    }
  }
  return args
}

// GT literal-forms observed from real probes (see plan spot-check sections) —
// any hit means a mistranslation leaked into the rendered UI.
const GT_LITERAL_TERMS = [
  'Nhà ga',
  'cá kình',
  'cam kết',
  'Cam kết',
  'chi nhánh',
  'cây công việc',
  'tuyến tính',
  'Mã mở',
  'Song Tử',
  'Đại lý',
  'đại lý phụ',
  'điều khiển từ xa',
  'sơ đồ công việc',
  'giết họ',
  'gần gũi',
  'Gần gũi',
  // Long-tail batch surfaced in the live UI (27/09 rule-0 dry-run).
  'Nhà thám hiểm',
  'Séc',
  'Hộp đựng trận đấu',
  'Người quản lý tài nguyên',
  'Giúp đỡ'
]

// Why: the flow must work from an English profile and a profile already
// switched to vi — labels differ per language.
const LABELS = {
  appearanceNav: ['Appearance', 'Giao diện'],
  languageTrigger: ['Language', 'Ngôn ngữ'],
  backToApp: ['Back to app', 'Quay lại ứng dụng']
}

const RAW_KEY_PATTERNS = [
  { name: 'auto.* key', re: /\bauto\.[A-Za-z][A-Za-z0-9.]*\b/ },
  {
    name: 'dotted catalog key',
    re: /\b(?:settings|menu|components|tray|dashboard|sidebar|onboarding)\.[a-z][a-zA-Z]+(?:\.[a-zA-Z0-9]+)+\b/
  },
  { name: '9-hex leaf hash', re: /\b[a-f0-9]{9}\b/ }
]

const lines = []
function report(line) {
  lines.push(line)
  console.log(line)
}

async function dumpButtons(page) {
  return page.evaluate(() => {
    const seen = []
    for (const button of document.querySelectorAll(
      'button,[role="button"],[role="menuitem"],[role="tab"]'
    )) {
      const label = (button.getAttribute('aria-label') ?? button.textContent ?? '')
        .trim()
        .replace(/\s+/g, ' ')
      if (label && !seen.includes(label)) {
        seen.push(label)
      }
    }
    return seen.slice(0, 120)
  })
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  await fs.mkdir(args.out, { recursive: true })
  const shot = async (page, name) => {
    const file = path.join(args.out, name)
    await page.screenshot({ path: file })
    report(`  screenshot: ${file}`)
  }

  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${args.port}`)
  const pages = browser.contexts().flatMap((context) => context.pages())
  report(`CDP pages: ${pages.map((page) => page.url()).join(' | ') || '(none)'}`)
  const page = pages.find((candidate) => !candidate.url().startsWith('devtools')) ?? pages[0]
  if (!page) {
    throw new Error('No page found over CDP')
  }
  await page.waitForLoadState('domcontentloaded')

  // --- Tier 1: switch vi → Settings opens in Vietnamese -------------------
  // Two entry states: main view (gear button opens settings) or already inside.
  let gear = null
  for (const label of ['Settings', 'Cài đặt']) {
    const candidate = page.locator(`button[aria-label="${label}"]`).first()
    if ((await candidate.count()) > 0) {
      gear = candidate
      break
    }
  }
  let alreadyInSettings = false
  for (const label of LABELS.appearanceNav) {
    if ((await page.getByText(label, { exact: true }).count()) > 0) {
      alreadyInSettings = true
    }
  }
  if (!alreadyInSettings && gear) {
    await gear.click()
    await page.waitForTimeout(700)
  }

  // Why: nav rows expose role=button but a text-node click doesn't always land —
  // match the button role first, fall back to text.
  let appearanceNav = null
  for (const label of LABELS.appearanceNav) {
    const byRole = page.getByRole('button', { name: label, exact: true }).first()
    if ((await byRole.count()) > 0) {
      appearanceNav = byRole
      report(`  appearance nav via button: ${label}`)
      break
    }
    const byText = page.getByText(label, { exact: true }).first()
    if ((await byText.count()) > 0) {
      appearanceNav = byText
      report(`  appearance nav via text: ${label}`)
      break
    }
  }
  if (!appearanceNav) {
    report('FAIL: settings opened but no Appearance nav item. Buttons present:')
    for (const label of await dumpButtons(page)) {
      report(`  ? ${label}`)
    }
    throw new Error('Appearance section not found')
  }
  await appearanceNav.click()
  await page.waitForTimeout(400)
  await shot(page, '01-settings-before-switch.png')

  if (!args.skipSwitch) {
    // Why: a profile already on vi makes the vi switch a no-op — flip to English
    // first so tier 1 exercises a real en→vi live switch.
    if (args.resetEn) {
      const viTrigger = page.locator('[aria-label="Ngôn ngữ"]').first()
      if ((await viTrigger.count()) > 0) {
        await viTrigger.click()
        await page.waitForTimeout(400)
        const enOption = page.getByRole('option', { name: 'English' }).first()
        if ((await enOption.count()) > 0) {
          await enOption.click()
          await page.waitForTimeout(900)
          report('  reset profile language to English first')
        }
      }
    }
    let trigger = null
    for (const label of LABELS.languageTrigger) {
      const candidate = page.locator(`[aria-label="${label}"]`).first()
      if ((await candidate.count()) > 0) {
        trigger = candidate
        break
      }
    }
    if (!trigger) {
      report('FAIL: language select trigger not found (aria-label Language/Ngôn ngữ).')
      throw new Error('Language picker not found')
    }
    await trigger.click()
    await page.waitForTimeout(400)
    const viOption = page.getByRole('option', { name: 'Tiếng Việt' }).first()
    if ((await viOption.count()) === 0) {
      const options = await page.getByRole('option').allTextContents()
      report(`FAIL: "Tiếng Việt" option missing. Options: ${options.join(' | ')}`)
      throw new Error('Vietnamese option not found')
    }
    await viOption.click()
    await page.waitForTimeout(900)
  }

  const bodyText = await page.evaluate(() => document.body.innerText)
  if (!args.skipSwitch) {
    if (!bodyText.includes('Ngôn ngữ')) {
      report('FAIL: after switching, "Ngôn ngữ" not present — language switch did not apply live.')
      await shot(page, 'fail-after-switch.png')
      throw new Error('Language switch did not apply')
    }
    report('PASS tier 1: switch vi applied live — Settings pane renders Vietnamese')
  }
  await shot(page, '02-settings-vi.png')

  // --- Tier 2: sidebar in Vietnamese --------------------------------------
  // "Back to app" returns from the settings view to the main chrome.
  let back = null
  for (const label of LABELS.backToApp) {
    const candidate = page.getByRole('button', { name: label }).first()
    if ((await candidate.count()) > 0) {
      back = candidate
      break
    }
  }
  if (back) {
    await back.click()
    await page.waitForTimeout(600)
  } else {
    await page.keyboard.press('Escape')
    await page.waitForTimeout(500)
  }
  await shot(page, '03-sidebar-vi.png')
  report('PASS tier 2: sidebar captured (visual check: Vietnamese labels, no layout break)')

  // --- Tier 3: hygiene scans ----------------------------------------------
  const scanText = await page.evaluate(() => document.body.innerText)
  const hygiene = []
  for (const term of GT_LITERAL_TERMS) {
    if (scanText.includes(term)) {
      hygiene.push(`GT-literal "${term}"`)
    }
  }
  for (const { name, re } of RAW_KEY_PATTERNS) {
    const matches = [...new Set(scanText.match(new RegExp(re, 'g')) ?? [])]
    for (const match of matches.slice(0, 5)) {
      hygiene.push(`raw key ${name}: ${match}`)
    }
  }
  if (hygiene.length > 0) {
    report('FAIL tier 3: hygiene violations:')
    for (const violation of hygiene) {
      report(`  ✗ ${violation}`)
    }
    process.exitCode = 1
  } else {
    report('PASS tier 3: no raw catalog keys, no GT-literal terms in rendered text')
  }

  await fs.writeFile(path.join(args.out, 'rule0-verify.txt'), `${lines.join('\n')}\n`)
  report(`summary written: ${path.join(args.out, 'rule0-verify.txt')}`)
}

try {
  await main()
} catch (error) {
  console.error('RULE-0 verify FAILED:', error)
  process.exit(1)
}
