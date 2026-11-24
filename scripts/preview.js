import {readFile,writeFile} from 'node:fs/promises';
const read = file => readFile(new URL('../public/'+file,import.meta.url),'utf8');
const [source,css,js,seed,stamp,logo] = await Promise.all(['index.html','style.css','app.js','seed.json','alpes.svg','mark.svg'].map(read));
const svg = content => 'data:image/svg+xml;base64,' + Buffer.from(content).toString('base64');
const page = source
  .replace('<link rel="stylesheet" href="/style.css">',()=>'<style>'+css+'</style>')
  .replace('<script type="module" src="/app.js"></script>','')
  .replaceAll('/alpes.svg',svg(stamp)).replaceAll('/mark.svg',svg(logo))
  .replace('</body>',()=>'<script>window.NOEL_PREVIEW='+seed.replaceAll('<','\\u003c')+';</script><script>'+js+'</script></body>');
await writeFile(new URL('../Apercu.html',import.meta.url),page);
