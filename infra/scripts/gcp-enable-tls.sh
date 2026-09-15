#!/usr/bin/env bash
# TLS Let's Encrypt sur la VM schoolmatrix-api.
#
# À exécuter SUR LA VM :
#   gcloud compute ssh schoolmatrix-api --zone northamerica-northeast1-a \
#     --project shekinah-schoolmatrix --command \
#     "sudo bash -s api.institutionmixteshekinah.com vous@exemple.com" < infra/scripts/gcp-enable-tls.sh
#
# Prérequis (vérifiés par le script, il s'arrête sinon) :
#   1. Un enregistrement DNS A « api » → 34.118.138.96 dans la zone
#      institutionmixteshekinah.com (panneau Hostinger), propagé.
#   2. Le port 80 ouvert (règle allow-schoolmatrix-http) — le challenge HTTP-01
#      en a besoin, ne le fermez pas après coup.
#   3. Le port 443 ouvert (règle allow-schoolmatrix-https).
#
# Le bloc « IP nue » reste servi en HTTP sans redirection : le desktop et le
# mobile déjà déployés pointent encore http://34.118.138.96 et continuent de
# fonctionner pendant la transition.
set -euo pipefail

DOMAIN="${1:-}"
# 2e argument facultatif : e-mail d'avis d'expiration Let's Encrypt.
# Omis ou "-" => enregistrement sans e-mail (le renouvellement reste automatique
# via le timer systemd ; seuls les rappels d'expiration sont perdus).
EMAIL="${2:--}"
UPSTREAM="127.0.0.1:3000"

if [[ -z "$DOMAIN" ]]; then
  echo "Usage: sudo bash gcp-enable-tls.sh <domaine> [email-expiration]" >&2
  exit 2
fi
if [[ "$EMAIL" == "-" ]]; then
  ACCOUNT_ARGS=(--register-unsafely-without-email)
else
  ACCOUNT_ARGS=(--email "$EMAIL")
fi
if [[ $EUID -ne 0 ]]; then
  echo "Ce script doit tourner en root (sudo)." >&2
  exit 2
fi

echo "==> 1/5 Vérification DNS de $DOMAIN"
VM_IP="$(curl -s -H 'Metadata-Flavor: Google' \
  'http://metadata.google.internal/computeMetadata/v1/instance/network-interfaces/0/access-configs/0/external-ip' || true)"
RESOLVED="$(getent hosts "$DOMAIN" | awk '{print $1}' | head -1 || true)"
if [[ -z "$RESOLVED" ]]; then
  echo "ERREUR: $DOMAIN ne résout pas encore. Créez l'enregistrement A chez Hostinger et attendez la propagation." >&2
  exit 1
fi
if [[ -n "$VM_IP" && "$RESOLVED" != "$VM_IP" ]]; then
  echo "ERREUR: $DOMAIN résout vers $RESOLVED, or cette VM est $VM_IP." >&2
  exit 1
fi
echo "    OK — $DOMAIN → $RESOLVED"

echo "==> 2/5 Installation de certbot"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq certbot python3-certbot-nginx

echo "==> 3/5 Blocs nginx (domaine + IP nue)"
cat >/etc/nginx/sites-available/schoolmatrix-api <<NGINX_CONF
# Bloc nom de domaine — certbot y ajoute l'écoute 443 et la redirection 301.
server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN};
    client_max_body_size 20m;

    location / {
        proxy_pass http://${UPSTREAM};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 120s;
    }
}

# Bloc IP nue — transition. Pas de redirection : les clients déjà déployés
# (desktop Remote, mobile) appellent encore http://<ip> en clair.
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;
    client_max_body_size 20m;

    location / {
        proxy_pass http://${UPSTREAM};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 120s;
    }
}
NGINX_CONF

rm -f /etc/nginx/sites-enabled/default
ln -sfn /etc/nginx/sites-available/schoolmatrix-api /etc/nginx/sites-enabled/schoolmatrix-api
nginx -t
systemctl reload nginx

echo "==> 4/5 Émission du certificat Let's Encrypt (challenge HTTP-01)"
certbot --nginx \
  -d "$DOMAIN" \
  --non-interactive \
  --agree-tos \
  "${ACCOUNT_ARGS[@]}" \
  --redirect \
  --keep-until-expiring

echo "==> 5/5 Vérifications"
nginx -t
systemctl reload nginx
systemctl list-timers 'certbot*' --no-pager || true
certbot renew --dry-run

echo
echo "======================================================================"
echo " TLS actif."
echo " URL finale : https://${DOMAIN}"
echo " L'IP nue http://${VM_IP:-34.118.138.96} répond toujours en clair"
echo " (transition). À fermer une fois desktop et mobile bascules."
echo "======================================================================"
