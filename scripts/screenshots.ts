// Generate screenshots for the README. Blurs private note content (titles, body)
// while keeping public Bible/publication references crisp.

import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const BACKUP_FILE = process.env.JWL_FILE ??
	resolve(process.env.HOME ?? '~', 'Downloads/JW Library Backup/UserdataBackup_2026-04-30_iPad.jwlibrary');

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:5173';
const OUT_DIR = resolve(process.cwd(), 'docs/screenshots');

// Marker class is added to elements containing personal content;
// the rule below blurs only those, leaving public chrome (tab titles,
// references, dates) crisp.
const PRIVACY_CSS = `
	[data-private], .privacy-blur {
		filter: blur(7px);
		user-select: none;
	}
`;

async function applyPrivacy(page: import('playwright').Page) {
	await page.addStyleTag({ content: PRIVACY_CSS });
	await page.evaluate(() => {
		// Notes list: title + content preview only (refs + dates stay crisp).
		document.querySelectorAll('.note-item .text-ink, .note-item .text-ink-muted').forEach((el) => {
			el.classList.add('privacy-blur');
		});
		// Selected note: title h1, body prose, edit textarea.
		document.querySelectorAll('main .max-w-3xl h1.serif').forEach((el) => el.classList.add('privacy-blur'));
		document.querySelectorAll('.prose').forEach((el) => el.classList.add('privacy-blur'));
		document.querySelectorAll('textarea').forEach((el) => el.classList.add('privacy-blur'));
		// Tag/bookmark/playlist names — second column in the table panel.
		document.querySelectorAll('table tbody td:nth-child(2)').forEach((el) => el.classList.add('privacy-blur'));
		document.querySelectorAll('table tbody td:last-child').forEach((el) => el.classList.add('privacy-blur'));
	});
	await page.waitForTimeout(200);
}

async function main() {
	await mkdir(OUT_DIR, { recursive: true });

	const browser = await chromium.launch();
	const ctx = await browser.newContext({
		viewport: { width: 1440, height: 900 },
		deviceScaleFactor: 2,
		colorScheme: 'light'
	});
	const page = await ctx.newPage();

	console.log('→ landing (dropzone)');
	await page.goto(BASE_URL, { waitUntil: 'networkidle' });
	await page.waitForTimeout(800); // let fonts settle
	await page.screenshot({ path: `${OUT_DIR}/01-landing.png`, fullPage: false });

	console.log(`→ loading backup: ${BACKUP_FILE}`);
	const fileInput = page.locator('input[type=file]');
	await fileInput.setInputFiles(BACKUP_FILE);
	await page.waitForSelector('header', { timeout: 30000 });
	await page.waitForTimeout(2000); // sql.js + first render

	console.log('→ notes list (default tab)');
	await applyPrivacy(page);
	await page.screenshot({ path: `${OUT_DIR}/02-notes-list.png`, fullPage: false });

	console.log('→ single note detail');
	const firstNote = page.locator('.note-item').first();
	await firstNote.click();
	await page.waitForTimeout(400);
	await applyPrivacy(page);
	await page.screenshot({ path: `${OUT_DIR}/03-note-detail.png`, fullPage: false });

	console.log('→ export panel');
	await page.getByRole('button', { name: /Exportar Markdown/i }).click();
	await page.waitForTimeout(400);
	await applyPrivacy(page);
	await page.screenshot({ path: `${OUT_DIR}/04-export.png`, fullPage: false });
	await page.getByRole('button', { name: /^Cancelar$/ }).click();
	await page.waitForTimeout(200);

	console.log('→ tags tab');
	await page.getByRole('button', { name: /^Etiquetas/ }).click();
	await page.waitForTimeout(400);
	await applyPrivacy(page);
	await page.screenshot({ path: `${OUT_DIR}/05-tags.png`, fullPage: false });

	console.log('→ playlists tab');
	await page.getByRole('button', { name: /^Playlists/ }).click();
	await page.waitForTimeout(400);
	await applyPrivacy(page);
	await page.screenshot({ path: `${OUT_DIR}/06-playlists.png`, fullPage: false });

	console.log('→ maintenance tab');
	await page.getByRole('button', { name: /^Manutenção/ }).click();
	await page.waitForTimeout(400);
	await applyPrivacy(page);
	await page.screenshot({ path: `${OUT_DIR}/07-maintenance.png`, fullPage: false });

	await browser.close();
	console.log(`✓ screenshots → ${OUT_DIR}`);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
