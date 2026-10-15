import { cp, mkdir, mkdtemp, readFile, rm, writeFile, access } from "node:fs/promises";
import { execFileSync, spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";

test("v1.0.2 update refuses an unknown baseline, installs atomically, and restores exact v1.0.1", async () => {
  const temp = await mkdtemp(join(tmpdir(), "hbnf-mc-v102-"));
  try {
    const packageSource = fileURLToPath(new URL("..", import.meta.url));
    const archive = fileURLToPath(new URL("../../hbnf-opal-mission-control-local-v1.0.1-ios12.zip", import.meta.url));
    const packageDir = join(temp, "package"), www = join(temp, "www"), root = join(temp, "root"), target = join(www, "mission-control-local"), backup = join(root, "hbnf-mission-control-local.rollback-v1.0.1"), bin = join(temp, "bin");
    await cp(packageSource, packageDir, { recursive: true });
    await mkdir(target, { recursive: true }); await mkdir(root); await mkdir(bin);
    for (const name of ["index.html", "styles.css", "app.js", "local-transport.js", "rollback.sh", "rollback-update.sh"]) {
      await writeFile(join(target, name), execFileSync("unzip", ["-p", archive, "mission-control-local/" + name]));
    }
    await writeFile(join(target, ".hbnf-package-marker"), "hbnf-owner-mission-control-local-v1\n");
    await writeFile(join(target, ".hbnf-package-version"), "1.0.1\n");
    const shim = `#!/bin/sh\nif [ "$1" = "-c" ]; then failed=0; while read expected name; do actual=$(shasum -a 256 "$name" | awk '{print $1}'); if [ "$actual" != "$expected" ]; then echo "$name: FAILED"; failed=1; fi; done < "$2"; exit "$failed"; fi\nshasum -a 256 "$1"\n`;
    await writeFile(join(bin, "sha256sum"), shim, { mode: 0o755 });
    const env = { ...process.env, PATH: bin + ":" + process.env.PATH, HBNF_WWW_ROOT: www, HBNF_BACKUP_ROOT: root };
    const patchRootScript = async (name) => {
      const script = join(packageDir, name);
      const source = (await readFile(script, "utf8")).replace('[ "$(id -u)" = 0 ]', '[ "0" = 0 ]');
      await writeFile(script, source, { mode: 0o755 });
    };
    await patchRootScript("update-v1.0.2.sh");
    await patchRootScript("rollback-v1.0.2.sh");
    const sums = execFileSync("shasum", ["-a", "256", "app.js", "index.html", "install.sh", "local-transport.js", "manifest.json", "rollback.sh", "rollback-update.sh", "rollback-v1.0.2.sh", "styles.css", "tests/local-transport.test.mjs", "tests/update-v1.0.2.test.mjs", "tests/browser-regression.html", "update.sh", "update-v1.0.2.sh"], { cwd: packageDir, encoding: "utf8" });
    await writeFile(join(packageDir, "SHA256SUMS"), sums);

    const originalApp = await readFile(join(target, "app.js"));
    await writeFile(join(target, "app.js"), "changed baseline");
    const rejected = spawnSync("sh", [join(packageDir, "update-v1.0.2.sh")], { cwd: packageDir, env, encoding: "utf8" });
    assert.notEqual(rejected.status, 0, "unknown installed baseline must fail closed");
    assert.equal(await readFile(join(target, "app.js"), "utf8"), "changed baseline");
    await assert.rejects(access(backup));
    await writeFile(join(target, "app.js"), originalApp);

    execFileSync("sh", [join(packageDir, "update-v1.0.2.sh")], { cwd: packageDir, env, encoding: "utf8" });
    assert.equal((await readFile(join(target, ".hbnf-package-version"), "utf8")).trim(), "1.0.2");
    assert.match(await readFile(join(target, "index.html"), "utf8"), /id="showScoreboard"/);
    assert.match(await readFile(join(target, "app.js"), "utf8"), /kind:"scoreboard"/);
    assert.equal(await readFile(join(backup, "app.js"), "utf8"), originalApp.toString());

    execFileSync("sh", [join(target, "rollback-v1.0.2.sh")], { cwd: target, env, encoding: "utf8" });
    assert.equal((await readFile(join(target, ".hbnf-package-version"), "utf8")).trim(), "1.0.1");
    for (const name of ["index.html", "styles.css", "app.js", "local-transport.js", "rollback.sh", "rollback-update.sh"]) {
      assert.deepEqual(await readFile(join(target, name)), execFileSync("unzip", ["-p", archive, "mission-control-local/" + name]), name + " exact rollback");
    }
    await assert.rejects(access(backup));
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});
