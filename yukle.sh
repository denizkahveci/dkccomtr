#!/bin/sh
# dkc.com.tr yayina alma — rsync ile (git degil).
# asistan/ ASLA yuklenmez: Sybel'in promptu ve kurulum araclari herkese acik olmamali.
# gizlilik/ hukukcu onayina kadar yuklenmiyor; onaydan sonra asagidaki satiri sil.
set -e
cd "$(dirname "$0")"
rsync -av \
  --exclude .git \
  --exclude .gitignore \
  --exclude .DS_Store \
  --exclude README.md \
  --exclude yukle.sh \
  --exclude asistan \
  --exclude gizlilik \
  --rsync-path="sudo rsync" \
  ./ dkc:/var/www/dkc/public/
ssh dkc 'sudo chown -R dkc:dkc /var/www/dkc/public'
echo "Yayinda: https://dkc.com.tr"
