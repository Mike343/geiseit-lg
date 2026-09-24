# IPv6 (dual-stack) for the GeiseIT cluster

All addresses in this directory are examples (documentation prefix `2001:db8::/32`, ULA `fd12:3456:789a::/48`, `192.0.2.0/24`).
Replace them with your own before applying. Keep your real values in `deploy/private/`, which is git-ignored.

The cluster was converted from IPv4-only to dual-stack so the Looking Glass diagnostics pods can test over IPv6.

| Range | Use |
|-------|-----|
| `2001:db8:0:31::4E00/120` | Provider-assigned public block (example value) |
| `::4E01`/`::4E02` | OPNsense WAN address (`::4E02` in use) |
| `::4E10` | Reserved Virtual IP for inbound web traffic (not used yet) |
| `::4E11` | Virtual IP used as the NAT66 source for pod traffic; shown as the Looking Glass IPv6 address |
| `fd12:3456:789a::/48` | ULA prefix (generated randomly) |
| `fd12:3456:789a:1::/64` | LAN (OPNsense `::1`, nodes `::5`–`::8`) |
| `fd12:3456:789a:2::/64` | Calico IPv6 pod pool |
| `fd12:3456:789a:3::/112` | IPv6 service range |

## What was changed

- **OPNsense**: static IPv6 WAN address and gateway, ICMPv6 allowed on WAN, ULA `/64` on the LAN with unmanaged Router
  Advertisements, outbound NAT66 for the LAN to the WAN address and for the pod pool to `::4E11` (placed first).
- **Nodes**: `/etc/netplan/60-ipv6.yaml` (static address, default route via `fd12:3456:789a:1::1`, `accept-ra: false`),
  `net.ipv6.conf.all.forwarding=1` in `/etc/sysctl.d/99-k8s-ipv6.conf`, a `ufw` rule for `fd12:3456:789a::/48`, and
  `KUBELET_EXTRA_ARGS=--node-ip=<ipv4>,<ipv6>` in `/etc/default/kubelet`.
- **Control plane node**: `--service-cluster-ip-range=10.96.0.0/12,fd12:3456:789a:3::/112` on the API server and the
  controller manager. `--cluster-cidr` was left IPv4-only because Calico allocates pod addresses from its own pools.
- **ConfigMaps**: kube-proxy `clusterCIDR` now includes the IPv6 pod pool; `kubeadm-config` `serviceSubnet` includes the
  IPv6 service range. After a `kubeadm upgrade`, re-check both and the two control-plane manifests.
- **Calico**: `calico-installation-patch.json` adds the IPv6 pool (VXLAN CrossSubnet, NAT outgoing) and pins IPv6 address
  detection to the LAN prefix. `calico-installation-rollback.json` removes them.
- **Looking Glass**: `lookingGlass.ipv6` in the production values; diagnostics pods restarted to pick up IPv6.

## Verify

```sh
kubectl get servicecidr kubernetes -o jsonpath='{.spec.cidrs}'
kubectl get ippools.crd.projectcalico.org
kubectl get node <node> -o jsonpath='{.status.addresses}'
kubectl -n network-looking-glass get pods -l app.kubernetes.io/component=diagnostics -o jsonpath='{.items[*].status.podIPs}'
curl -s https://lg.geiseit.com/api/v1/status
```

Existing pods stay IPv4-only until restarted.
