const html = '<meta http-equiv="Content-Security-Policy" content="default-src &apos;self&apos; file:; script-src &apos;self&apos; file: &apos;unsafe-inline&apos;; style-src &apos;self&apos; &apos;unsafe-inline&apos; file:; connect-src &apos;self&apos; http://127.0.0.1:* ws://127.0.0.1:*; img-src &apos;self&apos; data: file:;" />';
const regex = /<meta[^>]*http-equiv="Content-Security-Policy"[^>]*>/gi;
console.log('Match:', html.match(regex));
console.log('Replace:', html.replace(regex, ''));