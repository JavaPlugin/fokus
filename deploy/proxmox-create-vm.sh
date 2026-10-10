#!/usr/bin/env bash
# Legt auf dem Proxmox-Host eine Debian-13-VM für FOKUS an (cloud-init, nur SSH-Schlüssel).
#
#   Aufruf auf dem Proxmox-Host als root:
#     bash proxmox-create-vm.sh --ssh-key ~/.ssh/id_ed25519.pub
#
#   Optionen (mit Standardwerten):
#     --vmid 210  --name fokus  --storage local-lvm  --bridge vmbr0
#     --cores 2   --memory 4096      --disk 32G           --user fokus
#     --ip dhcp   (oder z. B. 192.168.1.50/24,gw=192.168.1.1)
set -euo pipefail

VMID=210 NAME=fokus STORAGE=local-lvm BRIDGE=vmbr0 CORES=2 MEMORY=4096 DISK=32G
CI_USER=fokus IPCFG=dhcp SSH_KEY=""
IMG_URL="https://cloud.debian.org/images/cloud/trixie/latest/debian-13-genericcloud-amd64.qcow2"
IMG="/var/lib/vz/template/iso/debian-13-genericcloud-amd64.qcow2"

die() { printf '\033[31mx   %s\033[0m\n' "$*" >&2; exit 1; }
say() { printf '\033[1m==> %s\033[0m\n' "$*"; }

while [ $# -gt 0 ]; do
  case "$1" in
    --vmid) VMID="$2"; shift 2 ;;
    --name) NAME="$2"; shift 2 ;;
    --storage) STORAGE="$2"; shift 2 ;;
    --bridge) BRIDGE="$2"; shift 2 ;;
    --cores) CORES="$2"; shift 2 ;;
    --memory) MEMORY="$2"; shift 2 ;;
    --disk) DISK="$2"; shift 2 ;;
    --user) CI_USER="$2"; shift 2 ;;
    --ip) IPCFG="$2"; shift 2 ;;
    --ssh-key) SSH_KEY="$2"; shift 2 ;;
    *) die "Unbekannte Option: $1" ;;
  esac
done

command -v qm >/dev/null || die "Bitte auf dem Proxmox-Host ausführen."
command -v jq >/dev/null || apt-get install -y -qq jq >/dev/null
[ -f "$SSH_KEY" ] || die "SSH-Public-Key fehlt: --ssh-key pfad/zum/key.pub"
qm status "$VMID" >/dev/null 2>&1 && die "VMID $VMID ist schon belegt. Wähle eine andere mit --vmid."

say "Debian-13-Cloud-Image laden"
mkdir -p "$(dirname "$IMG")"
# Immer frisch laden, damit die VM mit aktuellen Sicherheitsupdates startet.
curl -fL --progress-bar -o "$IMG.tmp" "$IMG_URL"
mv "$IMG.tmp" "$IMG"

say "VM $VMID ($NAME) anlegen"
qm create "$VMID" --name "$NAME" --ostype l26 \
  --cores "$CORES" --memory "$MEMORY" --cpu host \
  --net0 "virtio,bridge=$BRIDGE" \
  --scsihw virtio-scsi-single \
  --agent enabled=1 \
  --serial0 socket --vga serial0 \
  --onboot 1
qm set "$VMID" --scsi0 "$STORAGE:0,import-from=$IMG,discard=on,ssd=1,iothread=1" >/dev/null
qm disk resize "$VMID" scsi0 "$DISK"
qm set "$VMID" --ide2 "$STORAGE:cloudinit" --boot order=scsi0 >/dev/null
qm set "$VMID" --ciuser "$CI_USER" --sshkeys "$SSH_KEY" --ipconfig0 "ip=$IPCFG" --ciupgrade 1 >/dev/null

say "VM starten"
qm start "$VMID"

say "Warte auf die IP der VM (bis zu 5 Minuten)"
# Das Cloud-Image bringt den Guest Agent erst nach install.sh mit.
# Bis dahin kommt die IP aus der ARP-Tabelle des Hosts.
ip=""
for _ in $(seq 1 60); do
  ip=$(qm guest cmd "$VMID" network-get-interfaces 2>/dev/null \
    | jq -r '.[] | select(.name!="lo") | ."ip-addresses"[]? | select(."ip-address-type"=="ipv4") | ."ip-address"' 2>/dev/null \
    | head -1) || true
  [ -n "$ip" ] && break
  mac=$(qm config "$VMID" | awk -F'[=,]' '/^net0/ {print tolower($2)}')
  ip=$(ip neigh | awk -v m="$mac" 'tolower($5)==m {print $1; exit}')
  [ -n "$ip" ] && break
  sleep 5
done

cat <<EOF

  VM $VMID ($NAME) läuft.
  IP: ${ip:-unbekannt (siehe Proxmox-Oberfläche → Summary)}

  Weiter auf der VM:
    ssh $CI_USER@${ip:-<IP>}
    sudo -i
    bash install.sh        # vorher hochladen, siehe README

  Tipp: In Proxmox unter Datacenter → Backup einen nächtlichen Job für VM $VMID anlegen.

EOF
