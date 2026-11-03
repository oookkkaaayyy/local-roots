"""Changed-only native source/recovery qualification for new Controls service.
No Cart, network, credentials, production or physical service contacted.
"""
import hashlib, io, json, os, pathlib, re, shutil, subprocess, tarfile, tempfile, unittest
from zipfile import ZipFile

R=pathlib.Path(__file__).resolve().parents[1]
OLD=R
MANIFEST=R/'TARGETS.tsv'
INSTALL=R/'release/cart116-opal-transaction.sh'
SVC=R/'candidate/opal/usr/libexec/hbnf-cart-glow-bridge'
PROVISION=R/'candidate/opal/usr/libexec/hbnf-cart-glow-provision'
INIT=R/'candidate/opal/etc/init.d/hbnf-cart-glow-bridge'
HELPER=R/'candidate/opal/usr/lib/hbnf-glow-overlay-v1.sh'

def sha(b):return hashlib.sha256(b).hexdigest()
def run(*cmd,stdin=None):return subprocess.run(cmd,input=stdin,text=True,capture_output=True)

class Fixture:
    def __init__(self, admitted=False):
        self.tmp=tempfile.TemporaryDirectory(prefix='cart116-new-service-')
        self.p=pathlib.Path(self.tmp.name)
        self.root=self.p/'root';self.root.mkdir()
        self.pkg=self.p/'package';shutil.copytree(R,self.pkg,ignore=shutil.ignore_patterns('tests','receipt','__pycache__'))
        # Runtime fixture modifies *only* a disposable copy; real source false.
        if admitted:
            for path,var in [(self.pkg/'candidate/opal/usr/libexec/hbnf-cart-glow-bridge','HBNF_CART_GLOW_SOURCE_ADMITTED'),(self.pkg/'candidate/opal/usr/lib/hbnf-glow-overlay-v1.sh','HBNF_OVERLAY_V1_SOURCE_ADMITTED')]:
                s=path.read_text();assert var+'=false' in s;path.write_text(s.replace(var+'=false',var+'=true',1))
        targets=[]
        for raw in (self.pkg/'TARGETS.tsv').read_text().splitlines():
            path,rel,hash_,pre,mode=raw.split('\t')
            if pre=='UNKNOWN': pre='ABSENT' # test-only simulated authenticated absence
            if admitted and path in ['/usr/libexec/hbnf-cart-glow-bridge','/usr/lib/hbnf-glow-overlay-v1.sh']:
                hash_=sha((self.pkg/rel).read_bytes())
            targets.append([path,rel,hash_,pre,mode])
        (self.pkg/'TARGETS.tsv').write_text(''.join('\t'.join(x)+'\n' for x in targets))
        self.targets=targets
        pre=self.root/'www/mission-control-local'
        pre.mkdir(parents=True)
        with tarfile.open(R/'rollback/owner-v120-exact.tar.gz','r:gz') as tar:
            tar.extractall(pre,filter='data')
        shutil.copyfile(R/'rollback/external-local-transport-original.js',pre/'local-transport.js')
        self.original={}
        for target,rel,h,prehash,mode in targets:
            p=self.root/target.lstrip('/')
            if p.exists():self.original[target]=sha(p.read_bytes())
            elif prehash=='ABSENT':self.original[target]=None
            else:raise AssertionError('unknown fixture source')
        self.archive=self.p/'archive.zip';self.archive.write_bytes(b'TEST-ONLY-FAKE-PACKAGE')
        self.backuphash='a'*64
        self.receipt=self.p/'approval'
        self.script=self.p/'installer.sh';s=INSTALL.read_text().replace('ROOT=/\n',f'ROOT={self.root}\n',1)
        assert f'ROOT={self.root}\n' in s
        self.script.write_text(s)
        self.tx='cart116-test-'+sha(self.p.as_posix().encode())[:32]
        self.write_receipt('PENDING')
    def write_receipt(self,state='PENDING',backup_sha=None,download=True,manifest_sha=None):
        self.receipt.write_text('\n'.join([
            'TRANSACTION_ID='+self.tx,
            'MANIFEST_SHA256='+(manifest_sha or sha((self.pkg/'TARGETS.tsv').read_bytes())),
            'CAPSULE_SHA256='+sha(self.archive.read_bytes()),
            'OWNER_APPROVED_EXACT_SOURCE='+state,
            'BACKUP_SHA256='+(backup_sha or self.backuphash),
            'BACKUP_DOWNLOAD_BACK_SHA256='+(backup_sha or self.backuphash),
            'BACKUP_DOWNLOAD_BACK_VERIFIED='+('YES' if download else 'NO'),
            'PHYSICAL_ACCEPTED_BY_OWNER=NO'
        ])+'\n')
        os.chmod(self.receipt,0o600)
    def invoke(self,action):return run('/usr/bin/busybox','ash',str(self.script),action,str(self.pkg),str(self.receipt),str(self.archive))
    def backup(self):
        r=self.invoke('backup');assert r.returncode==0,(r.stdout,r.stderr)
        b=(self.root/'root/cart116-controls-recovery'/self.tx/'backup.tar.gz')
        assert b.is_file()
        self.backuphash=sha(b.read_bytes())
        self.write_receipt('APPROVED_FOR_THIS_EXACT_MANIFEST',self.backuphash)
    def assert_original(self):
        for target,expect in self.original.items():
            p=self.root/target.lstrip('/')
            assert sha(p.read_bytes())==expect if expect else not p.exists(),target
    def cleanup(self):self.tmp.cleanup()

class NewServiceTransaction(unittest.TestCase):
    def test_01_new_bridge_has_no_legacy_actuator_or_inbound_server(self):
        src=SVC.read_text();self.assertIn('HBNF_CART_GLOW_SOURCE_ADMITTED=false',src)
        self.assertIn('sleep 15',src);self.assertIn('sleep 4',src)
        self.assertIn('mkdir "$RUN/one-process"',src)
        self.assertNotIn('op=next',src.replace('# No source-compatible legacy op=next/check',''))
        self.assertNotIn('aux_apply(',src);self.assertNotIn('hbnf_apply_pair_or_compensate',src)
        for forbidden in ('nc -l','httpd -p','mosquitto_pub','/ws','uci set','wledPayload'):
            self.assertNotIn(forbidden,src)
        self.assertIn('procd_set_param command "$BIN"',INIT.read_text())
        self.assertIn('START=96',INIT.read_text())
        self.assertIn('HBNF_CART_GLOW_SOURCE_ADMITTED=true',INIT.read_text())
        self.assertIn('HBNF_OVERLAY_V1_SOURCE_ADMITTED=true',INIT.read_text())
    def test_02_false_gate_starts_no_service_and_no_credential_read(self):
        r=run('/usr/bin/busybox','ash',str(SVC))
        self.assertEqual(r.returncode,0,r.stderr)
        self.assertEqual(r.stdout,'')
        self.assertIn('HBNF_OVERLAY_V1_SOURCE_ADMITTED=false',HELPER.read_text())
        self.assertIn('PENDING=/etc/hbnf-glow-overlay-v1.pending',HELPER.read_text())
        self.assertIn('CONF=/etc/hbnf-cart-glow-bridge.conf',HELPER.read_text())
    def test_03_no_secrets_in_source_release_and_root_0600_provision_contract(self):
        s=PROVISION.read_text()
        for key in ('umask 077','[ ! -e "$CONF" ]','RELAY_TOKEN','RELAY_API_KEY','stat -c %u:%a','chown 0:0'):
            self.assertIn(key,s)
        self.assertNotIn('read -p',s)
        self.assertNotRegex(s,r'RELAY_TOKEN=[A-Za-z0-9_\-]{43,}')
    def test_04_preflight_rejects_unverified_new_targets(self):
        f=Fixture()
        try:
            (f.pkg/'TARGETS.tsv').write_text(MANIFEST.read_text())
            f.write_receipt()
            r=f.invoke('preflight');self.assertNotEqual(r.returncode,0)
            self.assertIn('UNKNOWN',MANIFEST.read_text())
            f.assert_original()
        finally:f.cleanup()
    def test_05_matched_preflight_and_backup_include_all_21_owner_files(self):
        f=Fixture()
        try:
            a=f.invoke('preflight');self.assertEqual(a.returncode,0,(a.stdout,a.stderr))
            b=f.invoke('backup');self.assertEqual(b.returncode,0,(b.stdout,b.stderr))
            tarpath=f.root/'root/cart116-controls-recovery'/f.tx/'backup.tar.gz'
            with tarfile.open(tarpath) as tar:
                owners=[n for n in tar.getnames() if n.startswith('owner-pwa-full/') and n!='owner-pwa-full']
                self.assertEqual(len(owners),21)
            f.assert_original()
        finally:f.cleanup()
    def test_06_approval_refuses_missing_download_back_and_wrong_hash(self):
        f=Fixture(admitted=True)
        try:
            f.backup()
            f.write_receipt('APPROVED_FOR_THIS_EXACT_MANIFEST',f.backuphash,False)
            self.assertNotEqual(f.invoke('apply').returncode,0)
            f.write_receipt('APPROVED_FOR_THIS_EXACT_MANIFEST','b'*64)
            self.assertNotEqual(f.invoke('apply').returncode,0)
            f.assert_original()
        finally:f.cleanup()
    def test_07_review_gates_refuse_install_even_with_fake_approval(self):
        f=Fixture(admitted=False)
        try:
            f.backup();r=f.invoke('apply')
            self.assertEqual(r.returncode,104,(r.stdout,r.stderr))
            self.assertFalse((f.root/'root/cart116-controls-one-time'/f.tx).exists())
            f.assert_original()
        finally:f.cleanup()
    def test_08_disposable_true_gate_11_target_apply_reverse_exact_absent_and_original(self):
        f=Fixture(admitted=True)
        try:
            f.backup();r=f.invoke('apply');self.assertEqual(r.returncode,0,(r.stdout,r.stderr))
            for path,rel,new,pre,mode in f.targets:
                self.assertEqual(sha((f.root/path.lstrip('/')).read_bytes()),new,path)
            self.assertFalse((f.root/'etc/hbnf-cart-glow-bridge.conf').exists())
            self.assertNotEqual(f.invoke('apply').returncode,0) # one-time replay rejected
            b=f.invoke('rollback');self.assertEqual(b.returncode,0,(b.stdout,b.stderr))
            f.assert_original()
            self.assertTrue((f.root/'root/cart116-controls-one-time'/f.tx/'rollback_restored').exists())
        finally:f.cleanup()
    def test_09_manifest_tamper_and_preimage_drift_are_preflight_blocks(self):
        f=Fixture(admitted=True)
        try:
            f.pkg.joinpath('TARGETS.tsv').write_text(f.pkg.joinpath('TARGETS.tsv').read_text().replace('/usr/libexec/hbnf-cart-glow-bridge','/usr/libexec/evil'))
            self.assertNotEqual(f.invoke('preflight').returncode,0)
            f.pkg.joinpath('TARGETS.tsv').write_text('\n'.join('\t'.join(row) for row in f.targets)+'\n')
            f.write_receipt();(f.root/'www/mission-control-local/owner-pwa/hbnf-cart.js').write_text('modified externally')
            self.assertNotEqual(f.invoke('preflight').returncode,0)
        finally:f.cleanup()
    def test_10_preexisting_config_and_symlink_preimage_refused(self):
        f=Fixture()
        try:
            cf=f.root/'etc/hbnf-cart-glow-bridge.conf';cf.parent.mkdir(parents=True);cf.write_text('NOT_AN_OURS_CONFIG')
            self.assertNotEqual(f.invoke('preflight').returncode,0)
            cf.unlink();p=f.root/'usr/libexec/hbnf-cart-glow-bridge';p.parent.mkdir(parents=True);p.symlink_to('/tmp/evil')
            self.assertNotEqual(f.invoke('preflight').returncode,0)
        finally:f.cleanup()
    def test_11_exact_cred_provisioner_deny_injection_and_restore_absence(self):
        f=Fixture()
        try:
            s=PROVISION.read_text().replace('CONF=/etc/hbnf-cart-glow-bridge.conf',f'CONF={f.root}/etc/hbnf-cart-glow-bridge.conf').replace('TMP=/etc/.hbnf-cart-glow-bridge.conf.new',f'TMP={f.root}/etc/.hbnf-cart-glow-bridge.conf.new')
            script=f.p/'provision-test';script.write_text(s)
            cf=f.root/'etc/hbnf-cart-glow-bridge.conf';cf.parent.mkdir(parents=True,exist_ok=True)
            bad=run('/usr/bin/busybox','ash',str(script),stdin='bad\';echo INJECT\nA'*33+'\n')
            self.assertNotEqual(bad.returncode,0);self.assertFalse(cf.exists())
            good=run('/usr/bin/busybox','ash',str(script),stdin='a'*45+'\n'+'b'*40+'\n')
            self.assertEqual(good.returncode,0,good.stderr)
            self.assertEqual(cf.stat().st_mode & 0o777,0o600)
            self.assertEqual(good.stdout,'')
            self.assertNotEqual(run('/usr/bin/busybox','ash',str(script),stdin='a'*45+'\n'+'b'*40+'\n').returncode,0)
            cf.unlink()
        finally:f.cleanup()
    def test_13_mid_transaction_error_compensates_all_written_targets(self):
        f=Fixture(admitted=True)
        try:
            f.backup()
            src=f.script.read_text()
            needle='   dest="$ROOT${target}"; source="$PKG/$relative"'
            assert needle in src
            src=src.replace(needle,
                '   [ "$target" != /usr/lib/hbnf-glow-overlay-v1.sh ] || exit 105\n'+needle,1)
            f.script.write_text(src)
            result=f.invoke('apply')
            self.assertNotEqual(result.returncode,0,(result.stdout,result.stderr))
            f.assert_original()
            self.assertTrue((f.root/'root/cart116-controls-one-time'/f.tx/'install_started').exists())
            self.assertFalse((f.root/'etc/hbnf-cart-glow-bridge.conf').exists())
        finally:f.cleanup()

    def test_12_old_owner_transport_and_off_pwm_bytes_remain_pinned(self):
        lines=MANIFEST.read_text().splitlines()
        self.assertEqual(len(lines),11)
        self.assertEqual(sum('/www/' in x for x in lines),7)
        self.assertIn('ae6fc45f833bce652aa4844501df4d79ed19c135fcf22507995ee772b29930d7',MANIFEST.read_text())
        helper=HELPER.read_text();self.assertNotIn('aux_apply()',helper)
        self.assertNotIn('aux_apply(',helper);self.assertIn('gpio25/26 whose segments',helper.lower())
        self.assertIn('case "$ps" in',helper);self.assertIn('return 1 ;;',helper)

if __name__=='__main__':unittest.main(verbosity=2)
