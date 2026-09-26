# HBNF dedicated cart LAN — GL.iNet Opal / GL-SFT1200

## LAN
- SSID: `HBNF-Cart`
- embedded devices: 2.4 GHz
- security: WPA2-PSK/AES
- router: `192.168.8.1/24`
- DHCP: `192.168.8.100-199`
- client/AP isolation: OFF
- guest network: not used
- mDNS: not required

## DHCP reservations
- Matrix: `192.168.8.20`
- AUX: `192.168.8.21`
- game bridge: `192.168.8.30`
Reserve by the real MAC learned by Opal; never guess MACs.

## Internet upstream
Local LAN works without internet. When wanted, Opal Repeater/WISP joins iPhone `HBNFHotspot`. USB tether is an alternate. Matrix/AUX peer reachability never depends on upstream internet.

## Cold boot
Opal first -> Matrix/AUX/bridge -> optional iPhone hotspot. Verify direct IPs only.

## Migration/rollback
After main-release acceptance, add HBNF-Cart without deleting existing Matrix/AUX profiles. Validate two cold boots.
Rollback: power Opal off, return to preserved HBNFHotspot workflow, bridge off. No firmware/Supabase rollback is part of networking rollback.
