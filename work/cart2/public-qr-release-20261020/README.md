# Cart public QR release capsule — 2026-10-20

Status: candidate only; NOT deployed.

- Branch: cart2-parallel-deliverables-20261016
- Candidate manifest SHA-256: 6734069fdc131f48d75158b04afa576ebedf78da2e20431dd48fde1ab8d47c81
- Limiter migration SHA-256: 7fc76e61f74273d556fbda758bd9850aebcca5c733985af3d91494ec87ee6da6
- Candidate source archive SHA-256: 4b2a5a1c6397fb5571a4519c2960f05ca881601c8bca7733c282a833be2b151d
- Complete private Drive capsule: https://drive.google.com/file/d/1MqesYg5BGalkMYzgrelvgW0QS4Hjv7Gd/view
- Capsule SHA-256: a924b354c3b3801864e1394c096eeaa13c35070384291b331fb8aae626e6e7ea; 660184 bytes; remote bytes independently read back and matched.
- Cloudflare active v6: b4011065-63a7-422e-94d6-f082ba98d784; rollback v5: ccd15947-30a7-4d5a-a1c5-e63083b6ff8d.
- Supabase active function v31, ID 95df7773-e888-48c9-84b3-ceb517c901c7; project phcpbvuqibyarpfrftgx.
- PostgreSQL 17.11 isolated qualification: burst/refill, 64 concurrent calls, service-role ACLs and rollback passed; see postgres17-limiter-qualification.md.
- The HBNF website release owner coordination is pending. No shared production resource changed.
- Still open: Cloudflare preview and exact rollback rehearsal; coordinated Supabase approval; actual cellular QR-to-Matrix plus Owner-precedence acceptance.
- B0 remains parked. October 19 historical receipts remain UNKNOWN and were not searched or altered.

This commit is archival source custody only. It does not authorize or perform deployment.
