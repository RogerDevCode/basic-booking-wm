#!/bin/sh
# Generate self-signed SSL certificates for development
# For production, use Let's Encrypt or a proper CA
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout /etc/nginx/ssl/key.pem \
  -out /etc/nginx/ssl/cert.pem \
  -subj "/C=MX/ST=CDMX/L=MexicoCity/O=BookingTitanium/CN=localhost"
