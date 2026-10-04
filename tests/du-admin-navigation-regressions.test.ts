import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const page = readFileSync(resolve(process.cwd(), 'app/src/pages/DuAdminPage.tsx'), 'utf8');
const styles = readFileSync(resolve(process.cwd(), 'app/src/du-admin.css'), 'utf8');

test('D&U admin defaults to Submissions and keeps Gallery one tap away', () => {
  assert.match(page, /useState<'submissions'\|'gallery'>\('submissions'\)/);
  assert.match(page, /Submissions <span>/);
  assert.match(page, /onClick=\{\(\)=>setAdminView\('gallery'\)\}>Gallery/);
  assert.match(page, /adminView==='gallery'\?<GalleryPanel/);
  assert.ok(page.indexOf("adminView==='gallery'?<GalleryPanel") > page.indexOf('const [adminView'));
});

test('active submissions are ordered newest first and completed work is separated', () => {
  assert.match(page, /dashboard\?\.jobs\.filter\(job=>activeStates\.includes\(job\.workflow_status\)\)[\s\S]*?sort\(\(a,b\)=>Date\.parse\(b\.created_at\)-Date\.parse\(a\.created_at\)\)/);
  assert.match(page, /workflow_status==='complete'[\s\S]*?sort\(\(a,b\)=>Date\.parse\(b\.created_at\)-Date\.parse\(a\.created_at\)\)/);
  assert.match(page, /<details className="du-completed-jobs"><summary>Completed/);
});

test('admin layout constrains mobile content and wraps job actions without horizontal overflow', () => {
  assert.match(styles, /\.du-admin-dashboard,\.du-submissions,\.du-gallery-manager,\.du-job-card\{min-width:0;max-width:100%\}/);
  assert.match(styles, /@media\(max-width:620px\)[\s\S]*?\.du-admin-dashboard \.du-job-card \.button-row \.button\{flex:1 1 100%\}/);
  assert.match(styles, /\.du-submissions\{overflow-wrap:anywhere\}/);
});
