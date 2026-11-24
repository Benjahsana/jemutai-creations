# Jemutai Creations — website + Commitment to Order

A small website for Jemutai's sewing and crochet work. Visitors can commit
to a custom order (no payment). It needs Node.js (version 18 or newer) and nothing else.

## Run it on jah ssh (or any server)

1. Copy this folder to the server and go into it.
2. Pick a long secret word for the private export, then start it:

       ADMIN_TOKEN=pick-a-long-secret PORT=8080 node server.js

3. Open http://SERVER-ADDRESS:8080
4. To keep it running after you log out, use pm2:

       npm install -g pm2
       ADMIN_TOKEN=pick-a-long-secret PORT=8080 pm2 start server.js --name jemutai
       pm2 save

5. For a real web address with https (needed before you share it), point a
   domain at the server and put Caddy in front:  `caddy reverse-proxy --from yourdomain.com --to :8080`

## Where the commitments go

- They're saved to `data/commitments.json` on the server. Back this file up.
- The public list shows only first name, city, state, service (custom piece, alterations or tailoring), item and price range.
- Your private full list (last name, email, details, how they know you, consent) downloads as a spreadsheet:

      https://yourdomain.com/admin/commitments.csv?token=pick-a-long-secret

  Don't share that link.

## Spam protection

Hidden bot trap field, 5 submissions per visitor per hour, and one entry per email per item.
