import fs from 'node:fs';
import crypto from 'node:crypto';

const APP_PATH='app.js';
const EXPECTED_APP_BLOB='3880d6f6f96f9e687d910d5b603604ee19410745';

function gitBlobSha(content){
  const body=Buffer.from(content,'utf8');
  return crypto.createHash('sha1').update(`blob ${body.length}\0`).update(body).digest('hex');
}

let app=fs.readFileSync(APP_PATH,'utf8');
const actual=gitBlobSha(app);
if(actual!==EXPECTED_APP_BLOB) throw new Error(`app.js divergiu do blob auditado: ${actual} != ${EXPECTED_APP_BLOB}`);

const storageAnchor="    function dailyTourStorageKey(){";
if(!app.includes(storageAnchor)) throw new Error('Âncora do tour não encontrada.');
const translations=`    Object.assign(translations, {\n      \"Continue no A-MES\":\"Continue in A-MES\",\n      \"O Console MES é a próxima camada factual: ele usa o mesmo contexto de linha, turno, CPH e falha para investigar dados de produção sem abrir um aplicativo paralelo.\":\"The MES Console is the next factual layer: it uses the same line, shift, CPH and failure context to investigate production data without opening a parallel app.\",\n      \"Abra o Console MES pela própria Central; o contexto operacional continua compartilhado.\":\"Open the MES Console from the Work Center; the operational context remains shared.\"\n    });\n\n`;
app=app.replace(storageAnchor,translations+storageAnchor);

const finalHelp="      steps.push({selector:'#dailyTourButton',restoreAdmin:true,title:t('Ajuda sempre disponível'),text:t('O guia não precisa ocupar a tela no uso diário. Use este ícone quando quiser rever o passo a passo.'),tip:t('Você também pode pular etapas clicando nos indicadores do tour.')});";
if(!app.includes(finalHelp)) throw new Error('Âncora final do tour não encontrada.');
const amesStep="      steps.push({selector:'button[data-page=\\\"mesConsole\\\"]',mobileSelector:'#mobileMenuToggle',title:t('Continue no A-MES'),text:t('O Console MES é a próxima camada factual: ele usa o mesmo contexto de linha, turno, CPH e falha para investigar dados de produção sem abrir um aplicativo paralelo.'),tip:t('Abra o Console MES pela própria Central; o contexto operacional continua compartilhado.')});";
app=app.replace(finalHelp,amesStep+'\n'+finalHelp);

const targetAnchor=`    function dailyTourTarget(){\n      const step=dailyTourSteps()[dailyTourStep];\n      return step?document.querySelector(step.selector):null;\n    }`;
if(!app.includes(targetAnchor)) throw new Error('Âncora de target do tour não encontrada.');
const targetReplacement=`    function dailyTourTarget(){\n      const step=dailyTourSteps()[dailyTourStep];\n      if(!step)return null;\n      const mobile=window.matchMedia('(max-width:860px)').matches;\n      const selector=mobile&&step.mobileSelector?step.mobileSelector:step.selector;\n      return selector?document.querySelector(selector):null;\n    }`;
app=app.replace(targetAnchor,targetReplacement);

fs.writeFileSync(APP_PATH,app,'utf8');
console.log('A-MES onboarding step applied safely.');
