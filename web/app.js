
    import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
    import {
      getFirestore, collection, addDoc, onSnapshot, doc, deleteDoc, updateDoc, setDoc, getDoc, getDocs, query, where, writeBatch
    } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
    import {
      getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword,
      sendPasswordResetEmail, confirmPasswordReset, sendEmailVerification, signOut
    } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

    const firebaseConfig = {
      apiKey: "AIzaSyBi8ll-uiEh9L9sPBXQZhqIbFxgLfnTjeM",
      authDomain: "central-de-controle-88962.firebaseapp.com",
      projectId: "central-de-controle-88962",
      storageBucket: "central-de-controle-88962.firebasestorage.app",
      messagingSenderId: "557459646371",
      appId: "1:557459646371:web:e5bfb77bfbcad6d50bdc16",
      measurementId: "G-J8RQMXQT4D"
    };

    const app = initializeApp(firebaseConfig);
    const db = getFirestore(app);
    const auth = getAuth(app);

    window.__centralLoginModuleReady = true;
    window.addEventListener('error', event => console.error('[Central] Erro global:', event.error || event.message));
    window.addEventListener('unhandledrejection', event => console.error('[Central] Promise rejeitada:', event.reason));

    // Nunca deixe uma Promise rejeitada ficar totalmente silenciosa.
    window.addEventListener('unhandledrejection', event => {
      console.error('[Central] Promise rejeitada sem tratamento:', event.reason);
    });
    const ADMIN_EMAIL = 'pedro.henrique@grupomultilaser.com.br';

    let state = {
      products: [],
      reports: [],
      operationalFailures: [],
      activities: [],
      flows: [],
      failureAnalyses: [],
      aiKnowledge: [],
      aiConversations: []
    };

    let users = [];
    let currentAccount = null;
    let currentAuthUser = null;
    let unsubscribeData = [];
    // Controle de concorrência da autenticação: criação/login e onAuthStateChanged
    // podem disparar juntos. Mantemos uma única inicialização por UID.
    let finishLoginPromise = null;
    let finishLoginUid = null;
    let authReady = false;
    let activeProduct = null;
    let activeView = 'home';
    let aiPreviousView = 'home';
    let homeCentralMode = 'mine';
    let selectedId = null;
    let selectedActivityId = null;
    let selectedFlowId = null;
    let selectedOperationalId = null;
    let familyToDelete = null;
    let continueToFailureAfterComponent = false;
    let expandedSidebarSection = localStorage.getItem('central.sidebar.expanded.v1') || '';
    let expandedProductFamily = localStorage.getItem('central.sidebar.productFamily.v1') || '';
    let expandedProductBase = localStorage.getItem('central.sidebar.productBase.v1') || '';
    let activeFamily = localStorage.getItem('central.sidebar.productActiveFamily.v1') || '';
    let familyToRename = null;

    // Internationalization: Portuguese is the source language; English is a UI translation.
    const LANGUAGE_KEY = 'controleFalhas.language.v1';
    let currentLanguage = localStorage.getItem(LANGUAGE_KEY) || 'pt-BR';
    const translations = {
      'Falhas':'Failures','Ocorrências operacionais separadas das falhas de produto.':'Operational occurrences separated from product failures.','+ Registrar falha':'+ Register failure','Registrar falha':'Register failure','Registrar falha': 'Register failure','Minha Central Hoje':'My Work Center Today','Atrasados':'Overdue','Hoje':'Today','Aguardando':'Waiting','Próximos':'Upcoming','Gerar Report rápido':'Generate quick report','Gerar resumo':'Generate summary','Quantidade acumulada':'Accumulated quantity','Salvar quantidade':'Save quantity','Salvar análise':'Save analysis','✦ Assistente':'✦ Assistant','✦ Gerar e-mail':'✦ Generate email',
      'Idioma':'Language','Português':'Portuguese','English':'English','Central de trabalho':'Work Center','Qualidade, reports e atividades':'Quality, reports and activities','Pesquisar em tudo...':'Search everything...','Áreas de trabalho':'Work areas',
      'Início':'Home','Reports de produto':'Product reports','Atividades gerais':'General activities','Fluxos':'Flows','Meu perfil':'My profile','+ Cadastrar produto':'+ Register product','Todos os reports':'All reports','Produtos por família':'Products by family','Registre agora. Complete o restante no momento certo.':'Record it now. Complete the rest at the right time.','Sair / Trocar conta':'Sign out / Switch account',
      'Novo produto':'New product','+ Componente':'+ Component','+ Cadastrar falha':'+ Register failure','+ Nova atividade':'+ New activity','+ Novo fluxo':'+ New flow',
      'Pendências totais':'Total pending','Falhas e atividades abertas':'Open failures and activities','Reports de produto':'Product reports','Com ação necessária':'Action required','Atividades gerais':'General activities','E-mails, análises e alinhamentos':'Emails, analyses and alignments','Aguardando fornecedor':'Waiting for supplier','Reports enviados sem resposta':'Reports sent without response',
      'Fila de trabalho':'Work queue','O que merece sua atenção primeiro.':'What deserves your attention first.','Nenhuma pendência no momento.':'No pending items at the moment.','Nova atividade geral':'New general activity','Ex.: enviar e-mail, analisar um reparo ou organizar uma reunião.':'E.g. send an email, analyze a repair, or organize a meeting.','Registrar Report de Produto':'Register Product Report','Use a família, produto e componente já cadastrados.':'Use an already registered family, product, and component.','Novo fluxo':'New flow','Organize formulário, e-mail, folha de rosto e seguimento.':'Organize the form, email, cover sheet, and follow-up.','Trabalho organizado':'Organized work','Reports de produto e tarefas administrativas ficam em áreas separadas, mas aparecem juntas na fila de prioridades.':'Product failures and administrative tasks stay in separate areas, but appear together in the priority queue.','Lembretes':'Reminders','Sem lembretes para esta conta':'No reminders for this account','Pendência atribuída a você.':'Pending item assigned to you.','Você é responsável pelo seguimento.':'You are responsible for the follow-up.',
      'Dashboard Estratégico':'Strategic Dashboard','Total de Falhas (Mês Atual)':'Total Failures (Current Month)','Registradas no mês vigente':'Recorded in the current month','Taxa de Resolução':'Resolution Rate','Reports totalmente concluídos':'Fully completed reports','Falhas Críticas / Abertas':'Critical / Open Failures','Sem envio de report':'Report not sent','Pendência de Resposta':'Awaiting Response','Aguardando resposta do fornecedor':'Waiting for supplier response','Top Componentes Ofensores (Mês Atual)':'Top Failure Components (Current Month)','Componentes com o maior número de falhas registradas este mês.':'Components with the highest number of failures recorded this month.','Nenhuma falha registrada neste mês.':'No failures recorded this month.','Distribuição dos Status':'Status Distribution','Visão de saúde global dos reports de produto.':'Global health view of product reports.','Progresso Geral':'Overall Progress','Concluídos':'Completed','Pendentes':'Pending','Aguardando Fornecedor':'Waiting for Supplier','concluída':'completed','ocorrência':'occurrence','ocorrências':'occurrences','neste mês':'this month','do mês':'of the month','finalizado':'completed',
      'Meu perfil de usuário':'My user profile','Resumo de suas atividades, reports subidos e configurações de conta.':'Summary of your activities, uploaded reports, and account settings.','Reports subidos':'Reports uploaded','Registrados por você':'Registered by you','Reports concluídos':'Reports completed','Finalizados com sucesso':'Successfully completed','Reports pendentes':'Pending reports','Precisam ser finalizados':'Need to be completed','Atividades & Fluxos':'Activities & Flows','Atribuídos a você':'Assigned to you','Meus Reports Enviados':'My Submitted Reports','Reports de produto registradas sob a sua autoria.':'Product failures registered by you.','Registro':'Record','Produto / Família':'Product / Family','Componente / Falha':'Component / Failure','Links':'Links','Status':'Status','Você ainda não subiu nenhum report.':'You have not uploaded any reports yet.','Gestão de Usuários (Acesso do Administrador)':'User Management (Administrator Access)','Gerencie quem tem acesso ao sistema e eleve privilégios de usuário.':'Manage who has access to the system and grant user privileges.','Nome':'Name','E-mail':'Email','Nível de Acesso':'Access Level','Ações':'Actions','Administrador':'Administrator','Usuário Normal':'Standard User','Tornar Usuário':'Make User','Promover a Adm':'Promote to Admin','Excluir':'Delete','Desativar':'Disable','Reativar':'Enable','(Sua conta)':'(Your account)',
      'Visão Geral do Produto':'Product Overview','Todas as informações conectadas a este único produto.':'All information connected to this single product.','Visão Geral':'Overview','Falhas':'Failures','Atividades':'Activities','Histórico':'History','Falhas de Produto':'Product Failures','Falhas Operacionais':'Operational Failures','Atividades Relacionadas':'Related Activities','Fluxos Relacionados':'Related Flows','Filtro:':'Filter:','Falhas':'Operational / Machines','Buscar falha':'Search failure','Material ou descrição':'Material or description','Componente':'Component','Todos':'All','Pendente':'Pending','Concluído':'Completed','Componente / falha':'Component / failure','Material':'Material','Responsável':'Owner','Pendências':'Pending items','Ainda não há falhas para este produto.':'There are no failures for this product yet.','Nenhuma atividade vinculada a este produto.':'No activities linked to this product.','Fluxo':'Flow','Escopo':'Scope','Criado Por':'Created By','Seguimento':'Follow-up','Nenhum fluxo vinculado a este produto.':'No flows linked to this product.','Nenhum histórico registrado ainda.':'No history recorded yet.',
      'Visão geral de todos os produtos e famílias.':'Overview of all products and families.','Buscar':'Search','Família':'Family','Todas':'All','Produto, componente ou material':'Product, component, or material','Atualização':'Update','Nenhum report encontrado.':'No report found.','Título, área ou descrição':'Title, area, or description','Nenhuma atividade encontrada.':'No activity found.','Produto, retrabalho ou descrição':'Product, rework, or description','Responsável pelo seguimento':'Follow-up owner','Etapas':'Steps','Nenhum fluxo encontrado.':'No flow found.','Formulário e e-mail, folha de rosto e seguimento organizados em três etapas.':'Form, email, cover sheet, and follow-up organized into three steps.',
      'Entrar na central':'Sign in to Work Center','Acesse com seu e-mail e senha corporativos.':'Sign in with your corporate email and password.','E-mail corporativo':'Corporate email','Senha':'Password','Esqueci minha senha':'Forgot my password','Criar uma conta':'Create an account','Entrar':'Sign in','Criar nova conta':'Create a new account','Cadastre-se para acessar a central. Novas contas iniciam como Usuário Normal.':'Register to access the work center. New accounts start as Standard User.','Seu nome':'Your name','Já tenho uma conta':'I already have an account','Cadastrar conta':'Create account','Recuperar senha':'Reset password','Informe seu e-mail e enviaremos um link seguro para criar uma nova senha.':'Enter your email and we will send a secure link to create a new password.','Nova senha':'New password','Digite a nova senha':'Enter the new password','Repetir nova senha':'Repeat new password','Digite a senha novamente':'Enter the password again','As duas senhas precisam ser exatamente iguais.':'Both passwords must be exactly the same.','As senhas não coincidem. Digite a mesma senha nos dois campos.':'The passwords do not match. Enter the same password in both fields.','As duas senhas coincidem.':'The passwords match.','Voltar para o login':'Back to sign in','Redefinir senha':'Reset password','Enviar link de recuperação':'Send recovery link','Trocar senha':'Change password','Finalizar troca de senha':'Finish password change','Salvando...':'Saving...','Se a conta existir, o Firebase enviará um link seguro para redefinição da senha. Abra o link recebido para escolher e confirmar a nova senha.':'If the account exists, Firebase will send a secure password reset link. Open the link to choose and confirm the new password.','Senha alterada com sucesso. Agora você pode entrar com a nova senha.':'Password changed successfully. You can now sign in with the new password.','O link de recuperação é inválido ou expirou. Solicite um novo link pelo login.':'The recovery link is invalid or expired. Request a new link from the login.','Este link de recuperação expirou. Solicite um novo link.':'This recovery link has expired. Request a new link.','Este link de recuperação é inválido. Solicite um novo link.':'This recovery link is invalid. Request a new link.',
      'Excluir família':'Delete family','Esta ação não poderá ser desfeita.':'This action cannot be undone.','Deseja realmente apagar esta família?':'Are you sure you want to delete this family?','Cancelar':'Cancel','Salvar falha':'Save failure','Nova atividade geral':'New general activity','E-mails, análises e tarefas organizadas.':'Organized emails, analyses, and tasks.','Título da atividade':'Activity title','Tipo':'Type','Área / assunto':'Area / subject','Prazo':'Due date','Descrição / contexto':'Description / context','Detalhes da atividade...':'Activity details...','Link relacionado':'Related link','Salvar atividade':'Save activity','Novo fluxo':'New flow','Acompanhamento de processos em três etapas.':'Three-step process follow-up.','Produto relacionado':'Related product','Não relacionado a produto':'Not related to a product','Tipo de retrabalho':'Rework type','Retrabalho de embalagem':'Packaging rework','Retrabalho de montagem':'Assembly rework','Embalagem e montagem':'Packaging and assembly','Outro fluxo':'Other flow','Link do e-mail enviado':'Sent email link','Explique por que o fluxo foi aberto.':'Explain why the flow was opened.','Formulário do fluxo':'Flow form','Salvar fluxo':'Save flow',
      'Descrição':'Description','Links do report':'Report links','Atualizar links e evidências':'Update links and evidence','Link do seu report':'Your report link','Link da resposta do fornecedor':'Supplier response link','Adicionar fotos/evidências':'Add photos/evidence','Salvar links e evidências':'Save links and evidence','Evidências registradas':'Recorded evidence','Nenhuma evidência anexada ainda.':'No evidence attached yet.','Atualização da falha':'Failure update','Adicionar atualização':'Add update','Histórico de atualizações':'Update history','Pendências automáticas':'Automatic pending items','Status calculated':'Calculated status','Excluir registro':'Delete record','Contexto':'Context','Salvar alterações':'Save changes','Excluir atividade':'Delete activity','Situação':'Situation','Etapa 1 · Formulário e e-mail':'Step 1 · Form and email','Etapa 2 · Folha de rosto':'Step 2 · Cover sheet','Etapa 3 · Seguimento no fluxo':'Step 3 · Flow follow-up','Folha de rosto':'Cover sheet','Link / arquivo da folha de rosto':'Cover sheet link / file','Link ou registro do seguimento':'Follow-up link or record','Salvar etapas':'Save steps','Selecione':'Select','Arquivos e links':'Files and links','Andamento do fluxo':'Flow progress','Status calculado':'Calculated status','Excluir fluxo':'Delete flow',
      'Cadastre o primeiro produto.':'Register the first product.','Sem pendências':'No pending items','em aberto':'open','Abrir link':'Open link','Abrir link relacionado':'Open related link','E-mail enviado':'Email sent','Folha de rosto':'Cover sheet','Registro de seguimento':'Follow-up record','Meu report':'My report','Resposta':'Response','Sem atualização':'No update','Geral':'General','Operacional':'Operational','Máquina':'Machine','Linha':'Line','Nenhum produto cadastrado':'No product registered','Cadastre uma família e um produto para começar.':'Register a family and a product to get started.','Consulta geral por família, produto e componente.':'General search by family, product, and component.','E-mails, análises, alinhamentos e tarefas que precisam acontecer.':'Emails, analyses, alignments, and tasks that need to happen.','Formulário, e-mail, folha de rosto e seguimento em um processo único.':'Form, email, cover sheet, and follow-up in one process.','Prioridades, reports de produto e atividades gerais em um só lugar.':'Priorities, product reports, and general activities in one place.','Visão executiva e indicadores gerais de falhas de produtos.':'Executive view and general product failure indicators.','E-mails, análises, alinhamentos e outras tarefas que não pertencem a uma falha de produto.':'Emails, analyses, alignments, and other tasks that do not belong to a product failure.'
    };
    const originalTextNodes = new WeakMap();
    const originalAttrs = new WeakMap();
    function translatePage() {
      const root = document.body;
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let node;
      while (node = walker.nextNode()) {
        const parent = node.parentElement;
        if (!parent || ['SCRIPT','STYLE'].includes(parent.tagName)) continue;
        if (!originalTextNodes.has(node)) originalTextNodes.set(node, node.nodeValue);
        const original = originalTextNodes.get(node);
        const trimmed = original.trim();
        if (!trimmed) continue;
        const translated = translations[trimmed];
        if (currentLanguage === 'en-US' && translated) node.nodeValue = node.nodeValue.replace(trimmed, translated);
        if (currentLanguage === 'pt-BR') node.nodeValue = original;
      }
      root.querySelectorAll('input,textarea,select,button,a,[title],[aria-label]').forEach(el => {
        ['placeholder','title','aria-label'].forEach(attr => {
          if (!el.hasAttribute(attr)) return;
          if (!originalAttrs.has(el)) originalAttrs.set(el, {});
          const attrs = originalAttrs.get(el);
          if (!(attr in attrs)) attrs[attr] = el.getAttribute(attr);
          const original = attrs[attr];
          const translated = translations[original];
          el.setAttribute(attr, currentLanguage === 'en-US' && translated ? translated : original);
        });
      });
      document.documentElement.lang = currentLanguage;
    }
    const t = value => currentLanguage === 'en-US' ? (translations[value] || value) : value;

    const now = () => new Date().toISOString();
    let dateFormat = new Intl.DateTimeFormat(currentLanguage, { dateStyle: 'short', timeStyle: 'short' });
    const esc = value => { const el = document.createElement('div'); el.textContent = value || ''; return el.innerHTML; };
    const formatDate = iso => iso ? dateFormat.format(new Date(iso)) : '—';

    const taskName = { photo: 'Fotos', report: 'Report', response: 'Resposta' };
    const statusName = { pendente: 'Pendente', aguardando: 'Aguardando fornecedor', concluido: 'Concluído' };
    const statusClass = { pendente: 'pending', aguardando: 'waiting', concluido: 'done' };
    const chip = status => `<span class="status ${statusClass[status] || 'pending'}">${esc(t(statusName[status] || 'Pendente'))}</span>`;
    
    const activityStatusName = { pendente: 'Pendente', andamento: 'Em andamento', aguardando: 'Aguardando', concluido: 'Concluída' };
    const activityStatusClass = { pendente: 'pending', andamento: 'andamento', aguardando: 'waiting', concluido: 'done' };
    const activityChip = status => { const normalized = status === 'concluido' ? 'concluido' : (status === 'aguardando' ? 'aguardando' : (status === 'andamento' ? 'andamento' : 'pendente')); return `<span class="status ${activityStatusClass[normalized] || 'pending'}">${esc(t(activityStatusName[normalized] || 'Pendente'))}</span>`; };

    const evidenceEntries = evidence => (evidence || []).map(item => typeof item === 'string' ? { name: item, type: '' } : item).filter(item => item?.name);
    const completedTasks = report => ({ photo: Boolean(evidenceEntries(report.evidence).length), report: Boolean(report.reportLink), response: Boolean(report.responseLink) });
    const calculatedStatus = report => { const tasks = completedTasks(report); if (tasks.photo && tasks.report && tasks.response) return 'concluido'; if (tasks.report && !tasks.response) return 'aguardando'; return 'pendente'; };
    const flowTaskName = { formEmail: 'Formulário e e-mail', cover: 'Folha de rosto', followUp: 'Seguimento' };
    const completedFlowSteps = flow => ({ formEmail: Boolean(evidenceEntries(flow.formAttachment).length && flow.emailLink), cover: Boolean(flow.coverLink), followUp: Boolean(flow.followUpLink) });
    const calculatedFlowStatus = flow => { const steps = completedFlowSteps(flow); if (steps.formEmail && steps.cover && steps.followUp) return 'concluido'; if (steps.formEmail) return 'andamento'; return 'pendente'; };

    const ordered = arr => [...arr].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    const safeLink = (url, label) => { try { const parsed = new URL(url); return /^https?:$/.test(parsed.protocol) ? `<a class="link" href="${esc(parsed.href)}" target="_blank" rel="noopener" onclick="event.stopPropagation()">${label} ↗</a>` : ''; } catch { return ''; } };
    const remaining = r => Object.entries(completedTasks(r)).filter(([, completed]) => !completed).map(([name]) => taskName[name]);

    // Compacta imagens antes de gravá-las no Firestore. Fotos de celular podem
    // ser grandes o suficiente para ultrapassar o limite de um documento.
    const readAttachments = files => Promise.all([...files].map(file => new Promise((resolve, reject) => {
      if (!file.type.startsWith('image/')) return resolve({ name: file.name, type: file.type });
      const reader = new FileReader();
      reader.onload = () => {
        const image = new Image();
        image.onload = () => {
          const maxDimension = 1000;
          const scale = Math.min(1, maxDimension / Math.max(image.width, image.height));
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(image.width * scale));
          canvas.height = Math.max(1, Math.round(image.height * scale));
          const ctx = canvas.getContext('2d');
          if (!ctx) return reject(new Error(`Não foi possível processar ${file.name}`));
          ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

          const targetBytes = 360 * 1024;
          let quality = .72;
          let data = canvas.toDataURL('image/jpeg', quality);
          while (data.length * 0.75 > targetBytes && quality > .38) {
            quality -= .06;
            data = canvas.toDataURL('image/jpeg', quality);
          }
          if (data.length * 0.75 > targetBytes) {
            const smaller = document.createElement('canvas');
            smaller.width = Math.max(1, Math.round(canvas.width * .75));
            smaller.height = Math.max(1, Math.round(canvas.height * .75));
            const sctx = smaller.getContext('2d');
            if (!sctx) return reject(new Error(`Não foi possível compactar ${file.name}`));
            sctx.drawImage(canvas, 0, 0, smaller.width, smaller.height);
            data = smaller.toDataURL('image/jpeg', .38);
          }
          resolve({ name: file.name, type: 'image/jpeg', data });
        };
        image.onerror = () => reject(new Error(`Não foi possível abrir ${file.name} como imagem`));
        image.src = reader.result;
      };
      reader.onerror = () => reject(new Error(`Não foi possível ler ${file.name}`));
      reader.readAsDataURL(file);
    })));

    const evidenceGallery = (evidence, options = {}) => {
      const entries = evidenceEntries(evidence);
      const allowDelete = Boolean(options.allowDelete);
      const kind = options.kind || '';
      const id = options.id || '';
      if (!entries.length) return 'Nenhuma evidência anexada ainda.';
      return entries.map((item, index) => item.data ? `<div class="evidence-card">
        <button type="button" class="evidence-image-button" data-open-evidence="${esc(item.data)}" data-evidence-name="${esc(item.name)}" aria-label="Abrir ${esc(item.name)}"><img class="evidence-image" src="${esc(item.data)}" alt="${esc(item.name)}"></button>
        ${allowDelete ? `<button type="button" class="evidence-delete" data-delete-evidence-kind="${esc(kind)}" data-delete-evidence-id="${esc(id)}" data-delete-evidence-index="${index}" title="Excluir evidência" aria-label="Excluir evidência">×</button>` : ''}
        <span class="evidence-name" title="${esc(item.name)}">${esc(item.name)}</span>
      </div>` : `<span class="evidence-file">${esc(item.name)}</span>`).join('');
    };

    function openEvidenceLightbox(data, name='Evidência') {
      const modal=document.querySelector('#evidenceLightbox');
      const img=document.querySelector('#evidenceLightboxImage');
      const label=document.querySelector('#evidenceLightboxName');
      if(!modal || !img) return;
      img.src=data; img.alt=name; if(label) label.textContent=name;
      modal.classList.remove('hidden');
    }
    function closeEvidenceLightbox(){ const modal=document.querySelector('#evidenceLightbox'); if(modal) modal.classList.add('hidden'); const img=document.querySelector('#evidenceLightboxImage'); if(img) img.src=''; }
    async function deleteEvidenceItem(kind,id,index){
      const entry=itemCollection(kind); if(!entry) return;
      const item=entry[1].find(x=>x.id===id); if(!item) return;
      const current=evidenceEntries(item.evidence);
      if(index<0 || index>=current.length) return;
      const target=current[index];
      if(!confirm(`Excluir a evidência "${target.name}"? Esta ação não pode ser desfeita.`)) return;
      const updated=current.filter((_,i)=>i!==index);
      const collectionName=entry[0];
      const updates=[...(item.updates||[]),{text:`Evidência removida: ${target.name}.`,date:now()}];
      await updateDoc(doc(db,collectionName,item.docId),{evidence:updated,updates});
      if(kind==='report') renderDetail();
      else if(kind==='operational') openOperationalDetail(id);
      else if(kind==='flow') renderFlowDetail();
    }

    function clearDataListeners() {
      unsubscribeData.forEach(unsubscribe => { try { unsubscribe(); } catch {} });
      unsubscribeData = [];
    }

    function legacyUsers() {
      try { return JSON.parse(localStorage.getItem('controleFalhas.users.v1') || '[]') || []; }
      catch { return []; }
    }

    function legacyState() {
      try { return JSON.parse(localStorage.getItem('controleFalhas.v2') || 'null'); }
      catch { return null; }
    }

    async function ensureUserProfile(firebaseUser, legacy = null) {
      const ref = doc(db, 'users', firebaseUser.uid);
      const snap = await getDoc(ref);
      const email = (firebaseUser.email || '').toLowerCase();
      const isAdminEmail = email === ADMIN_EMAIL;
      const data = snap.exists() ? snap.data() : {};
      const role = isAdminEmail ? 'admin' : (data.role || legacy?.role || 'user');
      const profile = {
        name: data.name || legacy?.name || firebaseUser.displayName || email.split('@')[0],
        email,
        role,
        disabled: Boolean(data.disabled),
        createdAt: data.createdAt || now(),
        updatedAt: now()
      };
      await setDoc(ref, profile, { merge: true });
      return { docId: firebaseUser.uid, ...profile };
    }

    async function migrateLegacyDataOnce() {
      const legacy = legacyState();
      if (!legacy || localStorage.getItem('controleFalhas.v8.dataMigration')) return;

      const collections = [
        ['products', Array.isArray(legacy.products) ? legacy.products : []],
        ['reports', Array.isArray(legacy.reports) ? legacy.reports : []],
        ['activities', Array.isArray(legacy.activities) ? legacy.activities : []],
        ['flows', Array.isArray(legacy.flows) ? legacy.flows : []]
      ];

      let imported = 0;
      for (const [collectionName, items] of collections) {
        for (const item of items) {
          if (!item || !item.id && collectionName !== 'products') continue;
          const idField = collectionName === 'products' ? 'code' : 'id';
          const identifier = item[idField];
          if (!identifier) continue;
          const existing = await getDocs(query(collection(db, collectionName), where(idField, '==', identifier)));
          if (!existing.empty) continue;
          const clean = { ...item, migratedFrom: 'controleFalhas.v2', migratedAt: now() };
          delete clean.docId;
          await addDoc(collection(db, collectionName), clean);
          imported++;
        }
      }
      localStorage.setItem('controleFalhas.v8.dataMigration', JSON.stringify({ at: now(), imported }));
    }

    async function migrateLegacyOperationalFailuresOnce() {
      const legacy = legacyState();
      const migrationKey = 'controleFalhas.v10.operationalRecovery';
      if (!legacy || localStorage.getItem(migrationKey)) return;
      const items = Array.isArray(legacy.operationalFailures) ? legacy.operationalFailures : [];
      let imported = 0;
      for (const item of items) {
        if (!item?.id) continue;
        const existing = await getDocs(query(collection(db, 'operationalFailures'), where('id', '==', item.id)));
        if (!existing.empty) continue;
        const clean = { ...item, migratedFrom: 'controleFalhas.v7', migratedAt: now() };
        delete clean.docId;
        await addDoc(collection(db, 'operationalFailures'), clean);
        imported++;
      }
      localStorage.setItem(migrationKey, JSON.stringify({ at: now(), imported, found: items.length }));
    }

    function syncFirestore() {
      clearDataListeners();
      if (!currentAuthUser) return;

      unsubscribeData.push(onSnapshot(collection(db, 'users'), async snapshot => {
        users = snapshot.docs.map(item => ({ docId: item.id, ...item.data() }));
        const me = currentAuthUser ? users.find(u => u.docId === currentAuthUser.uid) : null;
        if (me && currentAccount) {
          currentAccount = { ...currentAccount, name: me.name, email: me.email, role: me.role };
          if (me.disabled) {
            alert('Sua conta foi desativada por um administrador.');
            await signOut(auth);
            return;
          }
        }
        updateOwnerDropdowns();
        renderProfile();
        renderAccount();
      }, error => console.error('Falha ao sincronizar usuários:', error)));

      unsubscribeData.push(onSnapshot(collection(db, 'products'), snapshot => {
        state.products = snapshot.docs.map(item => ({ docId: item.id, ...item.data() }));
        if (!activeProduct && state.products.length > 0) activeProduct = state.products[0].code;
        fillActivityProducts();
        render();
      }, error => console.error('Falha ao sincronizar produtos:', error)));

      unsubscribeData.push(onSnapshot(collection(db, 'reports'), snapshot => {
        state.reports = snapshot.docs.map(item => ({ docId: item.id, ...item.data() }));
        render();
      }, error => console.error('Falha ao sincronizar reports:', error)));

      unsubscribeData.push(onSnapshot(collection(db, 'activities'), snapshot => {
        state.activities = snapshot.docs.map(item => ({ docId: item.id, ...item.data() }));
        render();
      }, error => console.error('Falha ao sincronizar atividades:', error)));

      unsubscribeData.push(onSnapshot(collection(db, 'flows'), snapshot => {
        state.flows = snapshot.docs.map(item => ({ docId: item.id, ...item.data() }));
        render();
      }, error => console.error('Falha ao sincronizar fluxos:', error)));

      unsubscribeData.push(onSnapshot(collection(db, 'operationalFailures'), snapshot => {
        state.operationalFailures = snapshot.docs.map(item => ({ docId: item.id, ...item.data() }));
        render();
      }, error => console.error('Falha ao sincronizar ocorrências operacionais:', error)));

      unsubscribeData.push(onSnapshot(collection(db, 'failureAnalyses'), snapshot => {
        state.failureAnalyses = snapshot.docs.map(item => ({ docId: item.id, ...item.data() }));
        renderAIHistory();
      }, error => console.error('Falha ao sincronizar análises de falhas:', error)));
      unsubscribeData.push(onSnapshot(collection(db, 'aiKnowledge'), snapshot => {
        state.aiKnowledge = snapshot.docs.map(item => ({ docId: item.id, ...item.data() }));
        aiUpdateAIState();
        renderAIMemoryPanel();
      }, error => console.error('Falha ao sincronizar memória da IA:', error)));
      unsubscribeData.push(onSnapshot(collection(db, 'aiConversations'), snapshot => {
        state.aiConversations = snapshot.docs.map(item => ({ docId: item.id, ...item.data() }));
        renderAIHistory();
      }, error => console.error('Falha ao sincronizar conversas da IA:', error)));
    }

    function updateOwnerDropdowns() {
      const userNames = users.map(u => u.name);
      ['#workOwner', '#activityOwnerSelect', '#flowOwnerSelect', '#flowOwner', '#flowDetailOwnerSelect', '#operationalOwnerSelect', '#opDetailOwnerSelect'].forEach(id => {
        const select = document.querySelector(id);
        if (!select) return;
        const current = select.value;
        const isFilter = id === '#workOwner' || id === '#flowOwner';
        select.innerHTML = (isFilter ? `<option value="">${esc(t('Todos'))}</option>` : `<option value="">${esc(t('Selecione'))}</option>`) +
          userNames.map(name => `<option value="${esc(name)}">${esc(name)}</option>`).join('');
        select.value = current;
      });
      populateAssigneeSelect('#activityAssignees', currentAccount ? [currentAccount.name] : []);
      populateAssigneeSelect('#failureAssignees', currentAccount ? [currentAccount.name] : []);
      populateAssigneeSelect('#operationalAssignees', currentAccount ? [currentAccount.name] : []);
      populateAssigneeSelect('#flowAssignees', currentAccount ? [currentAccount.name] : []);
      configureAssignmentUI('#activityAssignmentBox','#activityAssignees','#activityAssignmentNote');
      configureAssignmentUI('#failureAssignmentBox','#failureAssignees','#failureAssignmentNote');
      configureAssignmentUI('#operationalAssignmentBox','#operationalAssignees','#operationalAssignmentNote');
      configureAssignmentUI('#flowAssignmentBox','#flowAssignees',null);
      ['#activityAssignmentBox','#failureAssignmentBox','#operationalAssignmentBox','#flowAssignmentBox'].forEach(rootId=>{
        const root=document.querySelector(rootId);
        if(root) root.querySelectorAll('input[name="assignment_mode"]').forEach(r=>r.onchange=()=>updateAssignmentModeUI(rootId,'#'+root.querySelector('select').id));
      });
    }

    const productBaseCode = product => String(product?.baseCode || product?.code || '').trim();
    const productColor = product => String(product?.color || '').trim();
    const productFamily = product => String(product?.family || '').trim();
    const productCommercialName = product => String(product?.commercialName || product?.commercial || '').trim();
    // O identificador salvo continua sendo a chave da aplicação. Esta função só
    // normaliza a apresentação de códigos legados que foram cadastrados sem CPH.
    const productDisplayCode = value => {
      const code = String(value || '').trim().replace(/\s+/g, '');
      return /^\d{4}$/.test(code) ? `CPH${code}` : code;
    };
    const productMatchesQuery = (product, query) => {
      const q = String(query || '').toLowerCase().trim();
      if (!q) return true;
      const fields = [product?.code, product?.baseCode, product?.family, product?.commercialName, product?.color].filter(Boolean).map(v => String(v).toLowerCase());
      return fields.some(value => value.includes(q));
    };
    const activeData = () => state.products.find(p => p.code === activeProduct);

    const normalizeAssignment = item => {
      const mode = item?.assignmentMode || (item?.assignees?.length ? 'specific' : 'private');
      let assignees = Array.isArray(item?.assignees) ? item.assignees.filter(Boolean) : [];
      if (!assignees.length && item?.owner) assignees = [item.owner];
      return { mode, assignees };
    };
    const isAssignedToCurrentUser = item => {
      if (!currentAccount) return false;
      const a = normalizeAssignment(item);
      return a.assignees.includes(currentAccount.name)
        || item?.owner === currentAccount.name
        || item?.followUpOwner === currentAccount.name;
    };
    const isOpenToTeam = item => normalizeAssignment(item).mode === 'open';
    const isUnassigned = item => normalizeAssignment(item).assignees.length === 0;
    const isTeamShared = item => {
      const a = normalizeAssignment(item);
      return item?.teamShared === true
        || a.mode === 'open'
        || (a.mode === 'specific' && a.assignees.length > 1);
    };
    const isVisibleInMyCentral = item => isAssignedToCurrentUser(item) && !isOpenToTeam(item);
    const selectedNames = id => [...(document.querySelector(id)?.selectedOptions || [])].map(o => o.value).filter(Boolean);
    function configureAssignmentUI(rootSelector, selectId, noteId) {
      const root=document.querySelector(rootSelector), select=document.querySelector(selectId);
      if(!root || !select) return;
      const radios=[...root.querySelectorAll('input[name="assignment_mode"]')];
      const isAdmin=currentAccount?.role==='admin';
      const currentMode=radios.find(r=>r.checked)?.value || 'private';
      select.disabled=!isAdmin || currentMode==='open';
      if (!isAdmin) {
        radios.forEach(r=>r.disabled=true);
        select.innerHTML=currentAccount ? `<option value="${esc(currentAccount.name)}" selected>${esc(currentAccount.name)}</option>` : '';
        if(noteId) document.querySelector(noteId).textContent='Sua conta cria a tarefa para você. O administrador pode redistribuí-la depois.';
      } else {
        radios.forEach(r=>r.disabled=false);
        if(noteId) document.querySelector(noteId).textContent='“Aberta para todos” fica disponível para a equipe. “Pessoas específicas” permite duas ou mais pessoas.';
      }
      if(currentMode==='private' && isAdmin) select.multiple=false;
      else select.multiple=true;
      root.classList.toggle('assignment-disabled', !isAdmin);
    }
    function updateAssignmentModeUI(rootSelector, selectId) {
      const root=document.querySelector(rootSelector), select=document.querySelector(selectId);
      if(!root || !select) return;
      const mode=root.querySelector('input[name="assignment_mode"]:checked')?.value || 'private';
      const isAdmin=currentAccount?.role==='admin';
      select.disabled=!isAdmin || mode==='open';
      select.multiple=mode!=='private';
      if(mode==='open') [...select.options].forEach(o=>o.selected=false);
      if(mode==='private' && select.selectedOptions.length>1){
        [...select.options].forEach((o,i)=>o.selected=i===0);
      }
    }
    function populateAssigneeSelect(id, current=[]) {
      const select=document.querySelector(id); if(!select) return;
      const names=users.map(u=>u.name).filter(Boolean);
      select.innerHTML=names.map(n=>`<option value="${esc(n)}">${esc(n)}</option>`).join('');
      const set=new Set(current);
      [...select.options].forEach(o=>o.selected=set.has(o.value));
    }
    function assignmentPayload(formElement, fallbackOwner) {
      const root=formElement.querySelector('.assignment-box');
      const mode=root?.querySelector('input[name="assignment_mode"]:checked')?.value || 'private';
      let assignees=selectedNames('#'+root.querySelector('select').id);
      if(currentAccount?.role!=='admin') assignees=[currentAccount?.name || fallbackOwner].filter(Boolean);
      if(mode==='private') assignees=assignees.slice(0,1);
      if(mode==='open') assignees=[];
      return {
        assignmentMode:mode,
        assignees,
        owner:assignees[0] || fallbackOwner || currentAccount?.name || 'Usuário Desconhecido',
        teamShared: mode==='open' || (mode==='specific' && assignees.length>1)
      };
    }

    function itemCollection(kind) {
      return {
        activity: ['activities', state.activities],
        flow: ['flows', state.flows],
        report: ['reports', state.reports],
        operational: ['operationalFailures', state.operationalFailures]
      }[kind];
    }
    function itemHasPendingRequest(item, requesterName) {
      return (item?.collaborationRequests || []).some(r => r.status === 'pending' && r.requesterName === requesterName);
    }
    function pendingRequestsFor(item) {
      return (item?.collaborationRequests || []).filter(r => r.status === 'pending');
    }
    function canManageParticipation(item) {
      return currentAccount && (currentAccount.role === 'admin' || isAssignedToCurrentUser(item));
    }
    async function requestParticipation(kind, id) {
      if (!currentAccount) return;
      const entry=itemCollection(kind); if(!entry) return;
      const item=entry[1].find(x=>x.id===id); if(!item) return;
      const a=normalizeAssignment(item);
      if (a.assignees.includes(currentAccount.name)) return;
      if (!isTeamShared(item)) return;
      if (itemHasPendingRequest(item,currentAccount.name)) {
        alert('Sua solicitação já está aguardando autorização.');
        return;
      }
      const requests=[...(item.collaborationRequests || []), {
        requesterName: currentAccount.name,
        requesterEmail: currentAccount.email || '',
        date: now(),
        status: 'pending'
      }];
      await updateDoc(doc(db, entry[0], item.docId), { collaborationRequests: requests });
      alert('Solicitação enviada. Quem já está na tarefa precisa autorizar sua participação.');
    }
    async function respondParticipation(kind, id, requesterName, approve) {
      if (!currentAccount) return;
      const entry=itemCollection(kind); if(!entry) return;
      const item=entry[1].find(x=>x.id===id); if(!item || !canManageParticipation(item)) return;
      const requests=[...(item.collaborationRequests || [])];
      const reqIndex=requests.findIndex(r=>r.status==='pending' && r.requesterName===requesterName);
      if(reqIndex<0) return;
      if(approve) {
        const assignees=[...new Set([...normalizeAssignment(item).assignees, requesterName])];
        requests[reqIndex]={...requests[reqIndex],status:'approved',approvedBy:currentAccount.name,approvedAt:now()};
        await updateDoc(doc(db, entry[0], item.docId), {
          assignees,
          owner: assignees[0] || requesterName,
          assignmentMode:'specific',
          teamShared:true,
          collaborationRequests:requests,
          updates:[...(item.updates||[]), {text:`${requesterName} foi autorizado(a) a participar da tarefa por ${currentAccount.name}.`,date:now()}]
        });
      } else {
        requests[reqIndex]={...requests[reqIndex],status:'denied',deniedBy:currentAccount.name,deniedAt:now()};
        await updateDoc(doc(db, entry[0], item.docId), {
          collaborationRequests:requests,
          updates:[...(item.updates||[]), {text:`Solicitação de participação de ${requesterName} não foi autorizada por ${currentAccount.name}.`,date:now()}]
        });
      }
    }
    async function claimOpenTask(kind, id) {
      if (!currentAccount) return;
      const entry=itemCollection(kind);
      if (!entry) return;
      const item=entry[1].find(x => x.id === id);
      if (!item) return;
      const a=normalizeAssignment(item);
      if (!(isOpenToTeam(item) || isUnassigned(item))) return;
      const existing=[...a.assignees];
      const assignees=[...new Set([...existing,currentAccount.name])];
      await updateDoc(doc(db, entry[0], item.docId), {
        assignmentMode: 'specific',
        assignees,
        owner: assignees[0] || currentAccount.name,
        teamShared: true,
        updates: [...(item.updates || []), {text:`Tarefa assumida por ${currentAccount.name}.`, date:now()}]
      });
      homeCentralMode = 'mine';
      setHomeCentralMode();
    }

    function teamItemActionMarkup(x, mode) {
      const item=x.item;
      const a=normalizeAssignment(item);
      const pending=pendingRequestsFor(item);
      const mine=a.assignees.includes(currentAccount?.name);
      const available=mode==='available';
      let buttons='';
      if(available) {
        buttons=`<button type="button" class="claim-btn" data-claim-kind="${x.kind}" data-claim-id="${esc(item.id)}">Assumir tarefa</button>`;
      } else if(mine) {
        buttons=`<span class="team-badge progress"><span class="dot"></span>Você participa</span>`;
      } else if(a.assignees.length) {
        buttons=`<button type="button" class="button secondary button-compact" data-request-kind="${x.kind}" data-request-id="${esc(item.id)}">Pedir para participar</button>`;
      }
      if(canManageParticipation(item) && pending.length) {
        buttons += pending.map(r=>`<button type="button" class="button primary button-compact" data-approve-kind="${x.kind}" data-approve-id="${esc(item.id)}" data-requester="${esc(r.requesterName)}">Autorizar ${esc(r.requesterName)}</button>`).join('');
      }
      return buttons;
    }

    function renderTeamRows(id, items, mode) {
      const el=document.querySelector('#'+id);
      if(!el) return;
      el.innerHTML=items.length ? items.slice(0,12).map(x=>{
        const type=x.kind==='activity'?'Atividade':x.kind==='flow'?'Fluxo':x.kind==='operational'?'Operacional':'Produto';
        const a=normalizeAssignment(x.item);
        const people=a.assignees.length ? ` · ${a.assignees.join(', ')}` : '';
        return `<div class="team-item" data-kind="${x.kind}" data-ref="${esc(x.item.id)}">
          <div class="team-item-main">
            <span class="home-item-type">${type}</span>
            <span class="identifier">${esc(itemLabel(x))}</span>
            <span class="secondary-text">${esc(itemSub(x))}${esc(people)}</span>
          </div>
          <div class="team-item-actions">${teamItemActionMarkup(x,mode)}</div>
        </div>`;
      }).join('') : '<div class="team-state">Nenhum item nesta categoria.</div>';
    }

    function renderParticipationRequests() {
      const panel=document.querySelector('#participationRequestsPanel');
      const list=document.querySelector('#participationRequestsList');
      if(!panel || !list) return;
      const groups=[];
      const all=[
        ...state.activities.map(item=>({kind:'activity',item})),
        ...state.flows.map(item=>({kind:'flow',item})),
        ...state.reports.filter(r=>(r.tipo_falha||'PRODUTO')==='PRODUTO').map(item=>({kind:'report',item})),
        ...state.operationalFailures.map(item=>({kind:'operational',item}))
      ];
      all.forEach(x=>{
        if(!canManageParticipation(x.item)) return;
        pendingRequestsFor(x.item).forEach(r=>groups.push({...x,request:r}));
      });
      panel.classList.toggle('hidden', groups.length===0);
      list.innerHTML=groups.map(x=>`<div class="participation-row">
        <div><strong>${esc(x.request.requesterName)}</strong><div class="meta">quer participar de ${esc(itemLabel(x))}</div></div>
        <div class="participation-actions">
          <button type="button" class="button primary button-compact" data-approve-kind="${x.kind}" data-approve-id="${esc(x.item.id)}" data-requester="${esc(x.request.requesterName)}">Autorizar</button>
          <button type="button" class="button secondary button-compact" data-deny-kind="${x.kind}" data-deny-id="${esc(x.item.id)}" data-requester="${esc(x.request.requesterName)}">Recusar</button>
        </div>
      </div>`).join('');
    }

    function renderTeamCentral() {
      const all=[
        ...state.activities.filter(a => !['concluido'].includes(activityEffectiveStatus(a))).map(item=>({kind:'activity',item})),
        ...state.flows.filter(f => calculatedFlowStatus(f)!=='concluido').map(item=>({kind:'flow',item})),
        ...state.reports.filter(r => (r.tipo_falha||'PRODUTO')==='PRODUTO' && calculatedStatus(r)!=='concluido').map(item=>({kind:'report',item})),
        ...state.operationalFailures.filter(r => operationalStatus(r)!=='concluido').map(item=>({kind:'operational',item}))
      ];
      const visible=all.filter(x=>isTeamShared(x.item) || isUnassigned(x.item));
      const available=visible.filter(x=>isUnassigned(x.item) || isOpenToTeam(x.item));
      const waiting=visible.filter(x=>priorityFor(x)==='waiting');
      const progress=visible.filter(x=>!available.includes(x) && !waiting.includes(x));
      const sortByDue=(a,b)=>new Date(a.item.dueDate || a.item.createdAt || 0)-new Date(b.item.dueDate || b.item.createdAt || 0);
      available.sort(sortByDue); waiting.sort(sortByDue); progress.sort(sortByDue);

      document.querySelector('#teamAvailableCount').textContent=available.length;
      document.querySelector('#teamProgressCount').textContent=progress.length;
      document.querySelector('#teamWaitingCount').textContent=waiting.length;

      renderTeamRows('teamAvailableList',available,'available');
      renderTeamRows('teamProgressList',progress,'progress');
      renderTeamRows('teamWaitingList',waiting,'waiting');

      const loadMap=new Map();
      users.filter(u=>u.name).forEach(u=>loadMap.set(u.name,{name:u.name,progress:0,waiting:0,overdue:0}));
      visible.forEach(x=>{
        normalizeAssignment(x.item).assignees.forEach(name=>{
          if(!loadMap.has(name)) loadMap.set(name,{name,progress:0,waiting:0,overdue:0});
          const status=priorityFor(x);
          if(status==='waiting') loadMap.get(name).waiting++;
          else if(status==='overdue') loadMap.get(name).overdue++;
          else loadMap.get(name).progress++;
        });
      });
      const load=[...loadMap.values()].filter(r=>r.progress||r.waiting||r.overdue).sort((a,b)=>(b.overdue-a.overdue)||(b.progress-a.progress)||a.name.localeCompare(b.name));
      document.querySelector('#teamLoadCount').textContent=load.length;
      document.querySelector('#teamLoadTable').innerHTML=`<div class="team-load-row header"><span>Pessoa</span><span>Andamento</span><span>Aguardando</span><span>Atrasadas</span></div>`+
        (load.length ? load.map(r=>`<div class="team-load-row"><span class="team-load-person">${esc(r.name)}</span><span class="team-load-num">${r.progress}</span><span class="team-load-num">${r.waiting}</span><span class="team-load-num">${r.overdue}</span></div>`).join('') : '<div class="team-state">Nenhuma tarefa compartilhada em andamento.</div>');

      renderParticipationRequests();
    }

    const normalizeActivityStatus = status => status === 'andamento' ? 'pendente' : (status || 'pendente');
    // Compatibility with older V7 data where activities used "andamento".
    const activityEffectiveStatus = a => normalizeActivityStatus(a.status);
    const todayKey = () => { const d = new Date(); return d.toISOString().slice(0,10); };
    const daysLate = due => { if (!due) return 0; const end = new Date(`${due}T23:59:59`); return Math.max(0, Math.floor((Date.now()-end.getTime())/86400000)); };
    const operationalStatus = r => r.status || 'pendente';
    const priorityFor = item => {
      if (item.kind === 'activity') {
        const a=item.item, d=a.dueDate;
        if (activityEffectiveStatus(a)==='concluido') return 'done';
        if (activityEffectiveStatus(a)==='aguardando') return 'waiting';
        if (d && daysLate(d)>0) return 'overdue';
        if (d===todayKey()) return 'today';
        return 'next';
      }
      if (item.kind === 'flow') {
        const s=calculatedFlowStatus(item.item); return s==='concluido' ? 'done' : (s==='andamento' ? 'next' : 'waiting');
      }
      if (item.kind === 'operational') return operationalStatus(item.item)==='aguardando' ? 'waiting' : 'next';
      return calculatedStatus(item.item)==='aguardando' ? 'waiting' : 'next';
    };
    const itemLabel = x => x.kind==='activity' ? x.item.title : x.kind==='flow' ? `${x.item.id} · ${x.item.scope}` : x.kind==='operational' ? `${x.item.id} · ${x.item.maquina || x.item.estacao || 'Operação'}` : `${x.item.product} · ${x.item.component || 'Falha'}`;
    const itemSub = x => x.kind==='activity' ? `${x.item.area || ''}${x.item.dueDate ? ' · Prazo '+formatDate(x.item.dueDate) : ''}` : x.kind==='flow' ? `${x.item.product || 'Sem produto'} · ${x.item.followUpOwner || ''}` : x.kind==='operational' ? `${x.item.category || 'Outro'} · ${x.item.issue || ''}` : `${x.item.issue || ''}`;
    function renderPriorityList(id, items, empty='Nenhum item') { const el=document.querySelector('#'+id); if(!el) return; el.innerHTML=items.length ? items.slice(0,6).map(x=>`<div class="priority-item" data-kind="${x.kind}" data-ref="${esc(x.item.id)}"><span class="identifier">${esc(itemLabel(x))}</span><span class="secondary-text">${esc(itemSub(x))}${x.kind==='activity' && daysLate(x.item.dueDate)>0 ? ` · atrasado há ${daysLate(x.item.dueDate)} dias` : ''}</span></div>`).join('') : `<div class="priority-empty">${empty}</div>`; }
    function allWorkItems() {
      return [
        ...state.activities.filter(isVisibleInMyCentral).map(item=>({kind:'activity',item})),
        ...state.flows.filter(isVisibleInMyCentral).map(item=>({kind:'flow',item})),
        ...state.reports.filter(r=>(r.tipo_falha||'PRODUTO')==='PRODUTO' && isVisibleInMyCentral(r)).map(item=>({kind:'report',item})),
        ...state.operationalFailures.filter(isVisibleInMyCentral).map(item=>({kind:'operational',item}))
      ];
    }
    function renderPriorities() {
      const items=allWorkItems(); const overdue=items.filter(x=>priorityFor(x)==='overdue'), today=items.filter(x=>priorityFor(x)==='today'), waiting=items.filter(x=>priorityFor(x)==='waiting'), next=items.filter(x=>priorityFor(x)==='next');
      ['Overdue','Today','Waiting','Next'].forEach((n,i)=>{ const el=document.querySelector('#priority'+n+'Count'); if(el) el.textContent=[overdue,today,waiting,next][i].length; });
      renderPriorityList('priorityOverdueList',overdue); renderPriorityList('priorityTodayList',today); renderPriorityList('priorityWaitingList',waiting); renderPriorityList('priorityNextList',next);
    }
    function generateReportText(r) { const lines=[`REPORT — ${r.product || ''}${r.component ? ' · '+r.component : r.maquina ? ' · Máquina '+r.maquina : ''}`,``, `Problema: ${r.issue || 'Não informado'}`]; if(r.material) lines.push(`Material: ${r.material}`); if(r.quantity != null) lines.push(`Quantidade acumulada: ${r.quantity} peças`); if(r.quantityPeriod) lines.push(`Período: ${r.quantityPeriod}`); if(r.analysis?.where) lines.push(`Local de detecção: ${r.analysis.where}`); if(r.analysis?.when) lines.push(`Início: ${formatDate(r.analysis.when)}`); if(r.analysis?.hypothesis) lines.push(`Hipótese de causa: ${r.analysis.hypothesis}`); if(r.analysis?.tests) lines.push(`Testes realizados: ${r.analysis.tests}`); if(r.analysis?.cause) lines.push(`Causa confirmada: ${r.analysis.cause}`); if(r.analysis?.action) lines.push(`Ação corretiva: ${r.analysis.action}`); return lines.join('\n'); }
    function generateAnalysisText(r) { const a=r.analysis||{}; const parts=[]; if(a.problem||r.issue) parts.push(`Foi identificada uma ocorrência relacionada ao ${r.component || r.maquina || 'item'} do produto ${r.product || 'registro operacional'}. Problema: ${a.problem || r.issue}.`); if(a.where) parts.push(`O problema foi detectado em ${a.where}.`); if(a.when) parts.push(`O início registrado foi ${formatDate(a.when)}.`); if(r.quantity!=null) parts.push(`A quantidade acumulada registrada é de ${r.quantity} peças.`); if(a.affected!=null && a.affected!=='') parts.push(`Quantidade afetada informada na análise: ${a.affected} peças.`); if(a.hypothesis) parts.push(`Hipótese de causa: ${a.hypothesis}.`); if(a.tests) parts.push(`Testes realizados: ${a.tests}.`); if(a.cause) parts.push(`Causa confirmada: ${a.cause}.`); if(a.action) parts.push(`Ação corretiva: ${a.action}.`); if(a.notes) parts.push(`Observações: ${a.notes}.`); return parts.join('\n\n'); }
    function copyText(text){ if(navigator.clipboard) navigator.clipboard.writeText(text).then(()=>alert('Texto copiado.')); else { const ta=document.createElement('textarea'); ta.value=text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); alert('Texto copiado.'); } }
    function renderGlobalResults(q){
      const term=q.toLowerCase().trim(), groups=[], match=(...v)=>v.filter(Boolean).join(' ').toLowerCase().includes(term);
      const products=state.products.filter(p=>productMatchesQuery(p, term) || match(p.components?.join(' ')));
      if(products.length) groups.push(['Produtos',products.map(p=>({title:p.code,sub:`Família: ${p.family}${productCommercialName(p) ? ` · ${productCommercialName(p)}` : ''}${productColor(p) ? ` · Cor: ${productColor(p)}` : ''}${productBaseCode(p)!==p.code ? ` · Base: ${productBaseCode(p)}` : ''}`,fn:()=>{activeProduct=p.code;activeFamily='';localStorage.removeItem('central.sidebar.productActiveFamily.v1');show('product');document.querySelector('#searchResultsModal').classList.add('hidden');}}))]);
      const reports=state.reports.filter(r=>(r.tipo_falha||'PRODUTO')==='PRODUTO' && match(r.id,r.product,r.family,r.component,r.material,r.issue,r.owner,r.defectCode,r.defectCategory,r.repairComment,r.updates?.map(u=>u.text).join(' ')));
      if(reports.length) groups.push(['Reports de produto',reports.map(r=>({title:`${r.id} · ${r.product}`,sub:`${r.component||'Componente'} · ${r.issue||''}`,fn:()=>{openDetail(r.id);document.querySelector('#searchResultsModal').classList.add('hidden');}}))]);
      const ops=state.operationalFailures.filter(r=>match(r.id,r.category,r.maquina,r.linha,r.estacao,r.onde_detectado,r.issue,r.owner,r.hypothesis,r.cause,r.correctiveAction));
      if(ops.length) groups.push(['Falhas',ops.map(r=>({title:`${r.id} · ${r.maquina||r.estacao||'Ocorrência'}`,sub:`${r.category||'Outro'} · ${r.issue||''}`,fn:()=>{show('operations');openOperationalDetail(r.id);document.querySelector('#searchResultsModal').classList.add('hidden');}}))]);
      const acts=state.activities.filter(a=>match(a.id,a.product,a.title,a.type,a.area,a.description,a.owner,a.updates?.map(u=>u.text).join(' ')));
      if(acts.length) groups.push(['Atividades',acts.map(a=>({title:`${a.id} · ${a.title}`,sub:a.product?`${a.product} · ${a.area}`:a.area,fn:()=>{openActivityDetail(a.id);document.querySelector('#searchResultsModal').classList.add('hidden');}}))]);
      const flows=state.flows.filter(f=>match(f.id,f.product,f.scope,f.description,f.creator,f.followUpOwner,f.updates?.map(u=>u.text).join(' ')));
      if(flows.length) groups.push(['Fluxos',flows.map(f=>({title:`${f.id} · ${f.scope}`,sub:f.product||'Sem produto',fn:()=>{openFlowDetail(f.id);document.querySelector('#searchResultsModal').classList.add('hidden');}}))]);
      document.querySelector('#searchResultsSubtitle').textContent=`Resultados para “${q}”`;
      window.__globalSearchActions=[]; let actionIndex=0;
      document.querySelector('#globalResults').innerHTML=groups.length ? groups.map(([name,arr])=>`<div class="search-result-group"><h4>${name} · ${arr.length}</h4>${arr.slice(0,12).map(x=>{const idx=actionIndex++;window.__globalSearchActions[idx]=x.fn;return `<div class="search-result" data-search-index="${idx}"><strong>${esc(x.title)}</strong><div class="secondary-text">${esc(x.sub)}</div></div>`;}).join('')}</div>`).join('') : '<div class="muted-box">Nenhum resultado encontrado.</div>';
      document.querySelector('#searchResultsModal').classList.remove('hidden');
    }
    function weeklySummaryHtml(){
      const nowD=new Date(), start=new Date(nowD); start.setDate(start.getDate()-6); const startMs=new Date(start.setHours(0,0,0,0)).getTime();
      const inWeek=x=>new Date(x.createdAt||0).getTime()>=startMs;
      const prod=state.reports.filter(inWeek).filter(r=>(r.tipo_falha||'PRODUTO')==='PRODUTO');
      const ops=state.operationalFailures.filter(inWeek); const acts=state.activities.filter(inWeek), flows=state.flows.filter(inWeek);
      const overdue=state.activities.filter(a=>activityEffectiveStatus(a)!=='concluido'&&daysLate(a.dueDate)>0);
      const waiting=state.reports.filter(r=>calculatedStatus(r)==='aguardando').length+ops.filter(r=>operationalStatus(r)==='aguardando').length+state.activities.filter(a=>activityEffectiveStatus(a)==='aguardando').length;
      const comp={}; [...prod,...ops].forEach(r=>{const c=r.component||r.maquina||'Geral';comp[c]=(comp[c]||0)+1});
      const top=Object.entries(comp).sort((a,b)=>b[1]-a[1]).slice(0,5);
      return `<div class="weekly-grid"><div class="mini-stat"><span>Reports de produto</span><strong>${prod.length}</strong></div><div class="mini-stat"><span>Operacionais</span><strong>${ops.length}</strong></div><div class="mini-stat"><span>Atividades</span><strong>${acts.length}</strong></div><div class="mini-stat"><span>Fluxos</span><strong>${flows.length}</strong></div><div class="mini-stat"><span>Atrasados</span><strong>${overdue.length}</strong></div><div class="mini-stat"><span>Aguardando</span><strong>${waiting}</strong></div><div class="mini-stat"><span>Total trabalhado</span><strong>${prod.length+ops.length+acts.length+flows.length}</strong></div><div class="mini-stat"><span>Período</span><strong style="font-size:13px">${formatDate(start)} – ${formatDate(nowD)}</strong></div></div><h3 style="margin-top:22px">Principais assuntos</h3>${top.length?top.map(([k,v],i)=>`<div class="rank-item"><strong>${i+1}. ${esc(k)}</strong><span>${v} ocorrência(s)</span></div>`).join(''):'<div class="muted-box">Nenhuma ocorrência registrada no período.</div>'}<h3 style="margin-top:22px">Pendências de atenção</h3><div class="generated-output">${overdue.length?overdue.map(a=>`• ${esc(a.title)} — atrasada há ${daysLate(a.dueDate)} dias`).join('\n'):'• Nenhuma atividade atrasada.'}</div>`;
    }
    function openWeeklySummary(){document.querySelector('#weeklyContent').innerHTML=weeklySummaryHtml();document.querySelector('#weeklyModal').classList.remove('hidden');}
    function generateActivityEmail(a){ const subject=`Atualização / pendência — ${a.title}${a.product?' · '+a.product:''}`; const body=`Olá,\n\nGostaria de solicitar uma atualização referente à atividade “${a.title}”.${a.product?`\nProduto: ${a.product}`:''}${a.dueDate?`\nPrazo: ${a.dueDate}`:''}\n\n${a.description||''}\n\nObrigado.`; return {subject,body}; }
    function engineeringAssistant(r){
      const source=[...state.reports,...state.operationalFailures];
      const similar=source.filter(x=>x.id!==r.id && (x.product && r.product && x.product===r.product || (r.component && x.component===r.component) || (r.maquina && x.maquina===r.maquina)));
      const total=similar.reduce((n,x)=>n+Number(x.quantity||0),0);
      return `ASSISTENTE DE ENGENHARIA\n\nRegistro: ${r.id}\nProduto: ${r.product || 'Operação / Máquina'}\n\nOcorrências relacionadas encontradas: ${similar.length}\nQuantidade acumulada informada nos registros relacionados: ${total} peças\n\n${similar.length?similar.slice(0,8).map(x=>`• ${x.id} — ${x.product||x.maquina||'Operação'} — ${x.component||x.maquina||'Geral'} — ${x.issue}`).join('\n'):'Nenhuma ocorrência semelhante encontrada na base atual.'}`;
    }


    function showAuthScreen(screen) {
      document.querySelector('#authLoginBox').classList.toggle('hidden', screen !== 'login');
      document.querySelector('#authRegisterBox').classList.toggle('hidden', screen !== 'register');
      document.querySelector('#authForgotBox').classList.toggle('hidden', screen !== 'forgot');
      document.querySelector('#authResetBox').classList.toggle('hidden', screen !== 'reset');
    }

    document.querySelector('#btnGoRegister').addEventListener('click', e => { e.preventDefault(); showAuthScreen('register'); });
    document.querySelector('#btnGoForgot').addEventListener('click', e => { e.preventDefault(); showAuthScreen('forgot'); });
    document.querySelector('#btnGoLoginFromReg').addEventListener('click', e => { e.preventDefault(); showAuthScreen('login'); });
    document.querySelector('#btnGoLoginFromForgot').addEventListener('click', e => { e.preventDefault(); showAuthScreen('login'); });
    document.querySelector('#btnGoLoginFromReset').addEventListener('click', e => { e.preventDefault(); clearPasswordResetUrl(); showAuthScreen('login'); });

    function sanitizeSensitiveUrlParams() {
      try {
        const url = new URL(window.location.href);
        const sensitive = ['password','passwd','pwd','senha'];
        let changed = false;
        sensitive.forEach(key => {
          if (url.searchParams.has(key)) {
            url.searchParams.delete(key);
            changed = true;
          }
        });
        if (changed) {
          window.history.replaceState({}, document.title, url.pathname + (url.searchParams.toString() ? `?${url.searchParams.toString()}` : '') + url.hash);
        }
      } catch {}
    }

    function clearPasswordResetUrl() {
      try {
        const url = new URL(window.location.href);
        url.searchParams.delete('mode');
        url.searchParams.delete('oobCode');
        url.searchParams.delete('apiKey');
        url.searchParams.delete('lang');
        window.history.replaceState({}, document.title, url.pathname + (url.searchParams.toString() ? `?${url.searchParams.toString()}` : '') + url.hash);
      } catch {}
    }

    function getPasswordResetCode() {
      try {
        const params = new URLSearchParams(window.location.search);
        return params.get('mode') === 'resetPassword' ? params.get('oobCode') : null;
      } catch { return null; }
    }

    function authErrorMessage(error) {
      const code = error?.code || '';
      const messages = {
        'auth/invalid-credential': 'E-mail ou senha incorretos.',
        'auth/invalid-login-credentials': 'E-mail ou senha incorretos.',
        'auth/user-not-found': 'E-mail ou senha incorretos.',
        'auth/wrong-password': 'E-mail ou senha incorretos.',
        'auth/email-already-in-use': 'Este e-mail já possui uma conta no Firebase.',
        'auth/weak-password': 'A senha precisa atender à política de senha do Firebase.',
        'auth/expired-action-code': 'Este link de recuperação expirou. Solicite um novo link.',
        'auth/invalid-action-code': 'Este link de recuperação é inválido. Solicite um novo link.',
        'auth/user-disabled': 'Esta conta está desativada. Procure um administrador.',
        'auth/requires-recent-login': 'Por segurança, faça login novamente antes de alterar a senha.',
        'auth/too-many-requests': 'Muitas tentativas. Aguarde alguns minutos e tente novamente.',
        'auth/network-request-failed': 'Falha de conexão com o Firebase. Verifique a internet e tente novamente.',
        'auth/operation-not-allowed': 'Este método de autenticação não está habilitado no Firebase.',
        'auth/unauthorized-domain': 'Este domínio não está autorizado no Firebase Authentication.',
        'auth/app-not-authorized': 'Este endereço não está autorizado para usar o Firebase.',
        'auth/invalid-api-key': 'A configuração do Firebase está inválida.',
        'permission-denied': 'O Firebase recusou o acesso. Verifique as regras do Firestore.',
        'unavailable': 'O Firebase está temporariamente indisponível. Tente novamente.',
        'failed-precondition': 'O Firebase não está pronto para esta operação. Verifique a configuração do projeto.',
        'deadline-exceeded': 'O Firebase demorou demais para responder. Tente novamente.',
        'aborted': 'A operação foi interrompida. Tente novamente.'
      };
      if (messages[code]) return messages[code];

      // Alguns erros de JavaScript/Firebase não possuem error.code.
      // Não escondemos mais esse detalhe atrás de "erro desconhecido".
      const rawMessage = String(error?.message || '').trim();
      if (rawMessage) return `Não foi possível concluir a operação. Detalhe: ${rawMessage}`;

      return 'Não foi possível concluir a operação. Tente novamente.';
    }

    async function finishLogin(firebaseUser, legacyUser = null) {
      if (!firebaseUser) return null;

      // Se a sessão já foi totalmente inicializada, não repita listeners,
      // migração ou gravação do perfil para o mesmo UID.
      if (currentAuthUser?.uid === firebaseUser.uid && currentAccount) {
        return currentAccount;
      }

      // Evita duas inicializações simultâneas quando createUser/signIn dispara
      // o onAuthStateChanged ao mesmo tempo em que o formulário chama finishLogin.
      if (finishLoginPromise && finishLoginUid === firebaseUser.uid) {
        return finishLoginPromise;
      }

      finishLoginUid = firebaseUser.uid;
      finishLoginPromise = (async () => {
        const profile = await ensureUserProfile(firebaseUser, legacyUser);
        if (profile.disabled) {
          await signOut(auth);
          alert('Esta conta está desativada. Procure um administrador.');
          return null;
        }

        currentAuthUser = firebaseUser;
        currentAccount = { uid: firebaseUser.uid, name: profile.name, email: profile.email, role: profile.role };

        // A sessão e os listeners do Firestore não dependem da migração legada.
        // A interface fica disponível imediatamente, mesmo se existir algum dado
        // antigo incompatível com o Firestore.
        syncFirestore();
        render();

        try {
          await migrateLegacyDataOnce();
          await migrateLegacyOperationalFailuresOnce();
        } catch (migrationError) {
          // A falha de migração não deve derrubar uma sessão válida nem exibir
          // um falso "erro desconhecido" depois de o usuário conseguir entrar.
          console.warn('Migração dos dados antigos não concluída:', migrationError);
        }

        return currentAccount;
      })();

      try {
        return await finishLoginPromise;
      } finally {
        finishLoginPromise = null;
        finishLoginUid = null;
      }
    }

    // ================= AUTH BOOTSTRAP V14.8 =================
    // O login fica isolado do restante da Central. Nenhum módulo de IA,
    // dashboard, migração ou renderização pode impedir o envio do formulário.
    const loginFormEl = document.querySelector('#loginForm');
    const loginButtonEl = document.querySelector('#loginButton');
    const loginStatusEl = document.querySelector('#authLoginStatus');
    const setLoginStatus = (message, kind='info') => {
      if (!loginStatusEl) return;
      loginStatusEl.textContent = message || '';
      loginStatusEl.className = `auth-status ${kind}`;
    };

    if (loginFormEl) {
      loginFormEl.addEventListener('submit', async e => {
        e.preventDefault();
        e.stopImmediatePropagation();
        const form = new FormData(loginFormEl);
        const email = String(form.get('email') || '').trim().toLowerCase();
        const password = String(form.get('password') || '');
        if (!email || !password) {
          setLoginStatus('Informe o e-mail e a senha.', 'error');
          return;
        }
        if (loginButtonEl) {
          loginButtonEl.disabled = true;
          loginButtonEl.textContent = 'Entrando...';
          loginButtonEl.setAttribute('aria-busy','true');
        }
        setLoginStatus('Validando acesso...', 'info');
        try {
          let credential;
          try {
            credential = await signInWithEmailAndPassword(auth, email, password);
          } catch (error) {
            const legacy = legacyUsers().find(u => String(u.email || '').toLowerCase() === email);
            if (['auth/user-not-found','auth/invalid-credential','auth/invalid-login-credentials'].includes(error?.code)
                && legacy && legacy.password === password) {
              credential = await createUserWithEmailAndPassword(auth, email, password);
            } else {
              throw error;
            }
          }
          const legacy = legacyUsers().find(u => String(u.email || '').toLowerCase() === email);
          const account = await finishLogin(credential.user, legacy);
          if (!account || currentAccount?.uid !== credential.user.uid) {
            const sessionError = new Error('O Firebase autenticou a conta, mas a sessão da Central não foi concluída.');
            sessionError.code = 'app/session-not-ready';
            throw sessionError;
          }
          authReady = true;
          renderAccount();
          render();
          setLoginStatus('', '');
        } catch (error) {
          console.error('[Central] Falha no login:', error);
          setLoginStatus(authErrorMessage(error), 'error');
        } finally {
          if (loginButtonEl) {
            loginButtonEl.disabled = false;
            loginButtonEl.textContent = 'Entrar';
            loginButtonEl.removeAttribute('aria-busy');
          }
        }
      });
    }


    document.querySelector('#registerForm').addEventListener('submit', async e => {
      e.preventDefault();
      const formElement = e.currentTarget;
      const form = new FormData(formElement);
      const name = form.get('name').trim();
      const email = form.get('email').trim().toLowerCase();
      const password = form.get('password');
      try {
        const credential = await createUserWithEmailAndPassword(auth, email, password);
        await setDoc(doc(db, 'users', credential.user.uid), {
          name, email, role: email === ADMIN_EMAIL ? 'admin' : 'user', disabled: false, createdAt: now(), updatedAt: now()
        }, { merge: true });
        try { await sendEmailVerification(credential.user); } catch (verificationError) { console.warn('Não foi possível enviar verificação:', verificationError); }
        await finishLogin(credential.user);
        alert(email === ADMIN_EMAIL ? 'Conta de administrador criada e vinculada ao e-mail informado.' : 'Conta criada com sucesso.');
        formElement.reset();
      } catch (error) {
        alert(authErrorMessage(error));
      }
    });

    document.querySelector('#forgotForm').addEventListener('submit', async e => {
      e.preventDefault();
      const formElement = e.currentTarget;
      const form = new FormData(formElement);
      const email = form.get('email').trim().toLowerCase();
      try {
        const actionCodeSettings = {
          url: window.location.origin + window.location.pathname,
          handleCodeInApp: true
        };
        await sendPasswordResetEmail(auth, email, actionCodeSettings);
        alert('Se a conta existir, o Firebase enviará um link seguro para redefinição da senha. Abra o link recebido para escolher e confirmar a nova senha.');
        formElement.reset();
        showAuthScreen('login');
      } catch (error) {
        alert(authErrorMessage(error));
      }
    });

    document.querySelector('#resetForm').addEventListener('submit', async e => {
      e.preventDefault();
      const code = getPasswordResetCode();
      const formElement = e.currentTarget;
      const form = new FormData(formElement);
      const newPassword = form.get('newPassword');
      const confirmPassword = form.get('confirmPassword');
      const hint = document.querySelector('#resetPasswordHint');
      const button = document.querySelector('#resetPasswordButton');

      if (!code) {
        alert('O link de recuperação é inválido ou expirou. Solicite um novo link pelo login.');
        clearPasswordResetUrl();
        showAuthScreen('forgot');
        return;
      }
      if (newPassword !== confirmPassword) {
        hint.textContent = 'As senhas não coincidem. Digite a mesma senha nos dois campos.';
        hint.style.color = 'var(--danger)';
        document.querySelector('#resetForm [name="confirmPassword"]').focus();
        return;
      }
      hint.textContent = 'As duas senhas coincidem.';
      hint.style.color = '#197244';
      button.disabled = true;
      button.textContent = 'Salvando...';
      try {
        await confirmPasswordReset(auth, code, newPassword);
        alert('Senha alterada com sucesso. Agora você pode entrar com a nova senha.');
        formElement.reset();
        clearPasswordResetUrl();
        showAuthScreen('login');
      } catch (error) {
        alert(authErrorMessage(error));
      } finally {
        button.disabled = false;
        button.textContent = 'Finalizar troca de senha';
      }
    });

    document.querySelector('#profileChangePassword').addEventListener('click', async () => {
      if (!currentAuthUser?.email) return alert('Não foi possível identificar o e-mail da conta atual.');
      try {
        const actionCodeSettings = {
          url: window.location.origin + window.location.pathname,
          handleCodeInApp: true
        };
        await sendPasswordResetEmail(auth, currentAuthUser.email, actionCodeSettings);
        alert('Enviamos um link de troca de senha para o seu e-mail. Abra o link e informe a nova senha duas vezes antes de finalizar.');
      } catch (error) {
        alert(authErrorMessage(error));
      }
    });

    sanitizeSensitiveUrlParams();
    const initialPasswordResetCode = getPasswordResetCode();
    if (initialPasswordResetCode) showAuthScreen('reset');

    onAuthStateChanged(auth, async firebaseUser => {
      if (!firebaseUser) {
        authReady = true;
        clearDataListeners();
        currentAuthUser = null;
        currentAccount = null;
        users = [];
        state.products = [];
        state.reports = [];
        state.operationalFailures = [];
        state.activities = [];
        state.flows = [];
        render();
        return;
      }
      try {
        const legacyUser = legacyUsers().find(u => (u.email || '').toLowerCase() === (firebaseUser.email || '').toLowerCase());
        await finishLogin(firebaseUser, legacyUser);
      } catch (error) {
        console.error(error);
        alert(authErrorMessage(error));
        await signOut(auth);
      } finally {
        authReady = true;
        render();
      }
    });

    function requestDeleteFamily(familyName) {
      if (currentAccount?.role !== 'admin') {
        alert('Apenas usuários administradores podem excluir famílias e produtos.');
        return;
      }
      familyToDelete = familyName;
      const familyProducts = state.products.filter(p => p.family === familyName);
      const productCodes = familyProducts.map(p => p.code);
      const reportsCount = state.reports.filter(r => productCodes.includes(r.product) || r.family === familyName).length;

      document.querySelector('#confirmTitle').textContent = `Excluir "${familyName}"`;
      document.querySelector('#confirmMessage').textContent = `Você tem certeza de que deseja remover a família ${familyName}?`;
      
      const warnEl = document.querySelector('#confirmWarning');
      if (familyProducts.length || reportsCount > 0) {
        warnEl.textContent = `Atenção: Isso excluirá permanentemente ${familyProducts.length} produto(s) e ${reportsCount} falha(s) vinculadas.`;
        warnEl.classList.remove('hidden');
      } else {
        warnEl.classList.add('hidden');
      }

      document.querySelector('#deleteConfirmModal').classList.remove('hidden');
    }

    function requestRenameFamily(familyName) {
      if (currentAccount?.role !== 'admin') {
        alert('Apenas usuários administradores podem renomear famílias.');
        return;
      }
      familyToRename = familyName;
      const input = document.querySelector('#familyRenameForm [name="newFamilyName"]');
      if (!input) return;
      input.value = familyName;
      document.querySelector('#familyRenameModal').classList.remove('hidden');
      input.focus();
      input.select();
    }

    function closeFamilyRenameModal() {
      document.querySelector('#familyRenameModal')?.classList.add('hidden');
      familyToRename = null;
      document.querySelector('#familyRenameForm')?.reset();
    }

    async function renameFamilyLegacy(newFamilyName) {
      const oldFamily = familyToRename;
      const next = String(newFamilyName || '').trim();
      if (!oldFamily || !next) return;
      if (currentAccount?.role !== 'admin') return alert('Apenas usuários administradores podem renomear famílias.');
      if (next.toLowerCase() === oldFamily.toLowerCase()) { closeFamilyRenameModal(); return; }
      if (state.products.some(p => productFamily(p).toLowerCase() === next.toLowerCase())) {
        alert('Já existe uma família com esse nome.');
        return;
      }
      const products = state.products.filter(p => productFamily(p) === oldFamily);
      if (!products.length) {
        showSaveToast('Nenhum produto foi encontrado nessa família. Atualize a página e tente novamente.', 'error');
        return;
      }
      const productCodes = products.map(p => p.code);
      try {
        // Uma família é uma alteração única. O batch impede que a árvore fique
        // renomeada apenas em parte caso uma gravação seja recusada pelas regras.
        const writes = [
          ...products.map(p => ({ collection: 'products', docId: p.docId, payload: { family: next, familyUpdatedAt: now(), familyUpdatedBy: currentAccount.email } })),
          ...state.reports.filter(r => r.family === oldFamily || productCodes.includes(r.product)).map(r => ({ collection: 'reports', docId: r.docId, payload: { family: next, familyUpdatedAt: now(), familyUpdatedBy: currentAccount.email } })),
          ...state.operationalFailures.filter(r => r.family === oldFamily || productCodes.includes(r.product)).map(r => ({ collection: 'operationalFailures', docId: r.docId, payload: { family: next, familyUpdatedAt: now(), familyUpdatedBy: currentAccount.email } })),
          ...state.activities.filter(r => r.family === oldFamily || productCodes.includes(r.product)).map(r => ({ collection: 'activities', docId: r.docId, payload: { family: next, familyUpdatedAt: now(), familyUpdatedBy: currentAccount.email } })),
          ...state.flows.filter(r => r.family === oldFamily || productCodes.includes(r.product)).map(r => ({ collection: 'flows', docId: r.docId, payload: { family: next, familyUpdatedAt: now(), familyUpdatedBy: currentAccount.email } })),
          ...state.failureAnalyses.filter(r => r.family === oldFamily || productCodes.includes(r.product)).map(r => ({ collection: 'failureAnalyses', docId: r.docId, payload: { family: next, familyUpdatedAt: now(), familyUpdatedBy: currentAccount.email } }))
        ].filter(write => write.docId);
        for (let offset = 0; offset < writes.length; offset += 450) {
          const batch = writeBatch(db);
          writes.slice(offset, offset + 450).forEach(write => batch.update(doc(db, write.collection, write.docId), write.payload));
          await batch.commit();
        }
        if (activeFamily === oldFamily) {
          activeFamily = next;
          localStorage.setItem('central.sidebar.productActiveFamily.v1', next);
        }
        if (expandedProductFamily === oldFamily) {
          expandedProductFamily = next;
          localStorage.setItem('central.sidebar.productFamily.v1', next);
        }
        if (expandedProductBase.startsWith(`${oldFamily}::`)) {
          expandedProductBase = `${next}::${expandedProductBase.slice(oldFamily.length + 2)}`;
          localStorage.setItem('central.sidebar.productBase.v1', expandedProductBase);
        }
        showSaveToast(`Família renomeada para “${next}”.`, 'success');
        closeFamilyRenameModal();
      } catch (error) {
        console.error('Falha ao renomear família:', error);
        showSaveToast('Não foi possível renomear a família agora.', 'error');
      }
    }

    // Authoritative rename path. The browser only updates its navigation after the
    // authenticated backend has committed every related Firestore record.
    async function renameFamily(newFamilyName) {
      const oldFamily = familyToRename;
      const next = String(newFamilyName || '').trim();
      if (!oldFamily || !next) return;
      if (currentAccount?.role !== 'admin') return alert('Only administrators can rename families.');
      if (next.toLocaleLowerCase() === oldFamily.toLocaleLowerCase()) { closeFamilyRenameModal(); return; }
      if (state.products.some(p => productFamily(p).toLocaleLowerCase() === next.toLocaleLowerCase())) {
        alert('A family with this name already exists.');
        return;
      }
      try {
        const result = await aiPostJSON('/api/families/rename', { oldFamily, newFamily: next, clientRole: currentAccount?.role || 'user' });
        if (!result?.ok) throw new Error(result?.error || 'Rename was not confirmed by the server.');
        if (activeFamily === oldFamily) { activeFamily = next; localStorage.setItem('central.sidebar.productActiveFamily.v1', next); }
        if (expandedProductFamily === oldFamily) { expandedProductFamily = next; localStorage.setItem('central.sidebar.productFamily.v1', next); }
        if (expandedProductBase.startsWith(`${oldFamily}::`)) { expandedProductBase = `${next}::${expandedProductBase.slice(oldFamily.length + 2)}`; localStorage.setItem('central.sidebar.productBase.v1', expandedProductBase); }
        closeFamilyRenameModal();
        showSaveToast(`Family renamed to “${next}” and synchronized.`, 'success');
      } catch (error) {
        console.error('Family rename failed:', error);
        // Preserve the existing direct-Firestore path for installations that have
        // not yet configured the optional Admin backend. It still persists data;
        // it is not a local-only UI fallback.
        if (/firebase admin|backend|http 503|failed to fetch/i.test(String(error?.message || ''))) {
          return renameFamilyLegacy(next);
        }
        showSaveToast(error?.message || 'Unable to rename the family now.', 'error');
      }
    }

    function closeConfirmModal() {
      document.querySelector('#deleteConfirmModal').classList.add('hidden');
      familyToDelete = null;
    }

    async function confirmDeleteFamily() {
      if (!familyToDelete) return;
      const familyProducts = state.products.filter(p => p.family === familyToDelete);
      const productCodes = familyProducts.map(p => p.code);

      for (const p of familyProducts) {
        await deleteDoc(doc(db, "products", p.docId));
      }
      const reportsToDelete = state.reports.filter(r => productCodes.includes(r.product) || r.family === familyToDelete);
      for (const r of reportsToDelete) {
        await deleteDoc(doc(db, "reports", r.docId));
      }

      if (familyProducts.some(p => p.code === activeProduct)) {
        activeProduct = state.products[0]?.code || null;
      }

      closeConfirmModal();
    }

    window.toggleUserRole = async function(email) {
      if (currentAccount?.role !== 'admin') return alert('Apenas administradores podem alterar permissões.');
      const u = users.find(user => user.email === email);
      if (!u || u.email === ADMIN_EMAIL) return;
      const newRole = u.role === 'admin' ? 'user' : 'admin';
      await updateDoc(doc(db, 'users', u.docId), { role: newRole, updatedAt: now() });
    };

    window.toggleUserDisabled = async function(email) {
      if (currentAccount?.role !== 'admin') return alert('Apenas administradores podem desativar contas.');
      const u = users.find(user => user.email === email);
      if (!u || u.email === ADMIN_EMAIL) return;
      const nextDisabled = !Boolean(u.disabled);
      await updateDoc(doc(db, 'users', u.docId), { disabled: nextDisabled, updatedAt: now() });
    };

    function renderTree() {
      const groups = state.products.reduce((acc, p) => {
        const family = productFamily(p) || 'Sem família';
        (acc[family] ??= []).push(p);
        return acc;
      }, {});
      const isAdmin = currentAccount?.role === 'admin';
      const chevron = dir => `<span class="family-chevron" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m9 6 6 6-6 6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></span>`;
      const menuIcon = `<svg viewBox="0 0 24 24"><path d="M12 6.5a1.4 1.4 0 1 0 0 .01M12 12a1.4 1.4 0 1 0 0 .01M12 17.5a1.4 1.4 0 1 0 0 .01" fill="currentColor"/></svg>`;
      const html = Object.entries(groups).sort(([a], [b]) => a.localeCompare(b)).map(([family, products]) => {
        const bases = products.reduce((acc, p) => {
          const base = productBaseCode(p) || p.code;
          (acc[base] ??= []).push(p);
          return acc;
        }, {});
        const familyOpen = expandedProductFamily === family;
        const familyId = `family-${btoa(unescape(encodeURIComponent(family))).replace(/=/g,'')}`;
        const baseHtml = Object.entries(bases).sort(([a], [b]) => a.localeCompare(b)).map(([baseCode, variants]) => {
          const sorted = [...variants].sort((a,b) => a.code.localeCompare(b.code));
          const baseOpen = expandedProductBase === `${family}::${baseCode}`;
          const variantsNeedExpand = sorted.length > 1;
          const renderProductButton = p => {
            const count = state.reports.filter(r => r.product === p.code && calculatedStatus(r) !== 'concluido').length;
            const color = productColor(p);
            const displayCode = esc(productDisplayCode(p.code));
            const meta = [color ? `<strong>Cor:</strong> ${esc(color)}` : '', productCommercialName(p) ? `<strong>Comercial:</strong> ${esc(productCommercialName(p))}` : ''].filter(Boolean).join(' · ');
            const metaHtml = meta ? `<span class="variant-meta">${meta}</span>` : '';
            return `<button class="product-btn ${activeView === 'product' && p.code === activeProduct ? 'active' : ''}" data-product="${esc(p.code)}" title="Abrir ${esc(p.code)}${color ? ' · '+color : ''}"><span>${displayCode}${color ? `<span class="variant-color">· ${esc(color)}</span>` : ''}</span><small>${count ? `${count} em aberto` : 'Sem pendências'}</small>${metaHtml}</button>`;
          };
          const variantItems = sorted.map(renderProductButton).join('');
          if (!variantsNeedExpand) {
            // Uma única variante já é o produto final: não repetir o código-base.
            return `<div class="base-group base-group-single">${variantItems}</div>`;
          }
          const baseButton = `<button type="button" class="base-toggle ${baseOpen?'active':''}" data-base-family="${esc(family)}" data-base-code="${esc(baseCode)}" aria-expanded="${baseOpen}" title="Abrir ${esc(productDisplayCode(baseCode))}"><span>${esc(productDisplayCode(baseCode))}</span><span class="base-chevron" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m9 6 6 6-6 6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></span></button>`;
          return `<div class="base-group base-group-multi">${baseButton}<div class="base-variants ${baseOpen?'':'hidden'}">${baseOpen?variantItems:''}</div></div>`;
        }).join('');
        return `<section class="family ${familyOpen?'open':''}" data-family-section="${esc(family)}">
          <div class="family-header">
            <button type="button" class="family-toggle ${familyOpen?'active':''}" data-family-toggle="${esc(family)}" aria-expanded="${familyOpen}" aria-controls="${familyId}"><span>${esc(family)}</span>${chevron()}</button>
            ${isAdmin?`<div class="family-menu-wrap"><button type="button" class="family-menu-button" data-family-menu="${esc(family)}" aria-label="Opções de ${esc(family)}" title="Opções">${menuIcon}</button><div class="family-menu" data-family-menu-panel="${esc(family)}"><button type="button" data-rename-family="${esc(family)}">Renomear família</button><button type="button" data-delete-family="${esc(family)}">Excluir família</button></div></div>`:''}
          </div>
          <div id="${familyId}" class="family-children ${familyOpen?'':'hidden'}">${familyOpen?baseHtml:''}</div>
        </section>`;
      }).join('');
      document.querySelector('#productTree').innerHTML = html || '<div class="muted" style="padding:10px">Cadastre o primeiro produto.</div>';
      document.querySelector('#allReports').classList.toggle('active', activeView === 'all');
    }

    function updatePageHeader() {
      const p = activeData(), productArea = ['product', 'all'].includes(activeView), page = activeView === 'all' ? 'product' : activeView;
      document.querySelector('#productActions').classList.toggle('hidden', !productArea);
      document.querySelector('#operationsActions').classList.toggle('hidden', activeView !== 'operations');
      const productExpanded = expandedSidebarSection === 'product';
      const operationsExpanded = expandedSidebarSection === 'operations';
      document.querySelector('#operationsBrowser').classList.toggle('hidden', !operationsExpanded);
      document.querySelector('#productBrowser').classList.toggle('hidden', !productExpanded);
      document.querySelector('[data-nav-group="product"] .nav-group-toggle')?.setAttribute('aria-expanded', String(productExpanded));
      document.querySelector('[data-nav-group="operations"] .nav-group-toggle')?.setAttribute('aria-expanded', String(operationsExpanded));

      document.querySelector('#activityActions').classList.toggle('hidden', activeView !== 'work');
      document.querySelector('#flowActions').classList.toggle('hidden', activeView !== 'flow');
      document.querySelectorAll('.main-nav button').forEach(button => button.classList.toggle('active', button.dataset.page === page));
      
      if (activeView === 'home') {
        document.querySelector('#pageTitle').textContent = t('Minha central de trabalho');
        document.querySelector('#pageSubtitle').textContent = t('Prioridades, reports de produto e atividades gerais em um só lugar.');
      } else if (activeView === 'dashboard') {
        document.querySelector('#pageTitle').textContent = t('Dashboard Estratégico');
        document.querySelector('#pageSubtitle').textContent = t('Visão executiva e indicadores gerais de falhas de produtos.');
      } else if (activeView === 'aiAnalysis') {
        document.querySelector('#pageTitle').textContent = 'CORA';
        document.querySelector('#pageSubtitle').textContent = 'Central de Orientação e Raciocínio Assistido.';
      } else if (activeView === 'profile') {
        document.querySelector('#pageTitle').textContent = t('Meu perfil de usuário');
        document.querySelector('#pageSubtitle').textContent = t('Resumo de suas atividades, reports subidos e configurações de conta.');
      } else if (activeView === 'operations') {
        document.querySelector('#pageTitle').textContent = 'Falhas';
        document.querySelector('#pageSubtitle').textContent = 'Ocorrências operacionais separadas das falhas de produto.';
      } else if (activeView === 'work') {
        document.querySelector('#pageTitle').textContent = t('Atividades gerais');
        document.querySelector('#pageSubtitle').textContent = t('E-mails, análises, alinhamentos e tarefas que precisam acontecer.');
      } else if (activeView === 'flow') {
        document.querySelector('#pageTitle').textContent = t('Fluxos');
        document.querySelector('#pageSubtitle').textContent = t('Formulário, e-mail, folha de rosto e seguimento em um processo único.');
      } else if (activeView === 'product' && p) {
        document.querySelector('#pageTitle').textContent = p.code;
        document.querySelector('#pageSubtitle').textContent = `${p.family} · registros e pendências deste produto`;
        document.querySelector('#newFailure').disabled = false;
        document.querySelector('#newFailure').style.opacity = '1';
      } else if (activeView === 'all') {
        document.querySelector('#pageTitle').textContent = t('Todos os reports');
        document.querySelector('#pageSubtitle').textContent = t('Consulta geral por família, produto e componente.');
        document.querySelector('#newFailure').disabled = !p;
        document.querySelector('#newFailure').style.opacity = p ? '1' : '.5';
      } else {
        document.querySelector('#pageTitle').textContent = t('Nenhum produto cadastrado');
        document.querySelector('#pageSubtitle').textContent = t('Cadastre uma família e um produto para começar.');
        document.querySelector('#newFailure').disabled = true;
        document.querySelector('#newFailure').style.opacity = '.5';
      }
    }

    function setOptions(selectId, values, placeholder = 'Todos') {
      const select = document.querySelector(selectId);
      if (!select) return;
      const current = select.value;
      select.innerHTML = `<option value="">${placeholder}</option>` + [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b)).map(v => `<option value="${esc(v)}">${esc(v)}</option>`).join('');
      select.value = [...select.options].some(o => o.value === current) ? current : '';
    }

    function renderProductStats() {
      const prodReports = state.reports.filter(r => r.product === activeProduct && (r.tipo_falha === 'PRODUTO' || !r.tipo_falha));
      document.querySelector('#prodTotalCount').textContent = prodReports.length;

      const allProductEvents = state.reports.filter(r => r.product === activeProduct).flatMap(r => (r.updates || []).map(u => ({ ...u, label: `${r.id} (${r.component || 'Operacional'})` })))
        .sort((a, b) => new Date(b.date) - new Date(a.date));

      document.querySelector('#productHistoryTimeline').innerHTML = allProductEvents.length ? `
        <div class="product-history-list">${allProductEvents.map(e => `
          <article class="product-history-item">
            <div class="product-history-date"><strong>${formatDate(e.date)}</strong>Atualização registrada</div>
            <div class="product-history-body"><strong>${esc(e.label)}</strong><p>${esc(e.text)}</p></div>
          </article>
        `).join('')}</div>
      ` : '';
      document.querySelector('#productHistoryEmpty').classList.toggle('hidden', allProductEvents.length > 0);
    }

    function linksCell(r) {
      const links = [safeLink(r.reportLink, 'Meu report'), safeLink(r.responseLink, 'Resposta')].filter(Boolean);
      return links.length ? `<div class="links">${links.join('')}</div>` : '<span class="muted">—</span>';
    }

    function productRow(r) {
      const isOp = r.tipo_falha === 'OPERACIONAL_MAQUINA';
      const mainTitle = isOp ? `[Máquina: ${r.maquina || 'N/A'}]` : r.component;
      const subTitle = isOp ? `Linha: ${r.linha || 'N/A'} - ${r.issue}` : r.issue;
      return `<tr data-id="${r.id}"><td><span class="identifier">${esc(r.id)}</span><span class="secondary-text">${formatDate(r.createdAt)}</span></td><td><span class="identifier">${esc(mainTitle)}</span><span class="secondary-text wrap">${esc(subTitle)}</span></td><td>${esc(r.material || '—')}</td><td>${esc(r.owner)}</td><td><span class="secondary-text" style="margin:0">${remaining(r).length ? esc(remaining(r).join(' · ')) : 'Sem pendências'}</span></td><td>${linksCell(r)}</td><td>${chip(calculatedStatus(r))}</td></tr>`;
    }

    function allRow(r) {
      return `<tr data-id="${r.id}"><td><span class="identifier">${esc(r.product)}</span><span class="secondary-text">${esc(r.family)}</span></td><td><span class="identifier">${esc(r.component || r.maquina || 'Geral')}</span><span class="secondary-text wrap">${esc(r.issue)}</span></td><td>${esc(r.material || '—')}</td><td>${esc(r.owner)}</td><td>${linksCell(r)}</td><td>${chip(calculatedStatus(r))}</td><td><span class="secondary-text wrap" style="margin:0">${r.updates?.length ? esc(r.updates[r.updates.length - 1].text) : 'Sem atualização'}</span></td></tr>`;
    }

    function renderProduct() {
      const titleEl = document.querySelector('#activeProductTitle');
      if (titleEl && activeData()) {
        titleEl.textContent = `${activeData().code} (${activeData().family}${productColor(activeData()) ? ` · ${productColor(activeData())}` : ''})`;
      }

      const selected = state.reports.filter(r => r.product === activeProduct);
      setOptions('#componentFilter', (activeData()?.components || selected.map(r => r.component)));
      const search = document.querySelector('#productSearch').value.toLowerCase().trim(), component = document.querySelector('#componentFilter').value, status = document.querySelector('#productStatus').value;

      const filtered = ordered(selected.filter(r => {
        const rType = r.tipo_falha || 'PRODUTO';
        if (rType !== 'PRODUTO') return false;
        const product = state.products.find(p => p.code === r.product);
        const text = [r.id, r.component, r.material, r.issue, r.owner, product?.baseCode, product?.color].join(' ').toLowerCase();
        return (!search || text.includes(search)) && (!component || r.component === component) && (!status || calculatedStatus(r) === status);
      }));
      
      renderProductStats();
      document.querySelector('#productRows').innerHTML = filtered.map(productRow).join('');
      document.querySelector('#productEmpty').classList.toggle('hidden', filtered.length > 0);
    }

    function renderAll() {
      setOptions('#allFamily', state.products.map(p => p.family));
      setOptions('#allComponent', state.reports.map(r => r.component));
      const search = document.querySelector('#allSearch').value.toLowerCase().trim();
      const selectedFamily = document.querySelector('#allFamily').value;
      const family = activeFamily || selectedFamily;
      const component = document.querySelector('#allComponent').value;
      const status = document.querySelector('#allStatus').value;
      if (activeFamily && [...document.querySelector('#allFamily').options].some(o => o.value === activeFamily)) {
        document.querySelector('#allFamily').value = activeFamily;
      }
      const filtered = ordered(state.reports.filter(r => {
        const product = state.products.find(p => p.code === r.product);
        const text = [r.product, r.family, r.component, r.material, r.issue, r.owner, product?.baseCode, product?.commercialName, product?.color].join(' ').toLowerCase();
        return (!search || text.includes(search)) && (!family || r.family === family) && (!component || r.component === component) && (!status || calculatedStatus(r) === status);
      }));
      document.querySelector('#allRows').innerHTML = filtered.map(allRow).join('');
      document.querySelector('#allEmpty').classList.toggle('hidden', filtered.length > 0);
    }


    function failureClassificationLabel(value){
      const map={NAO_DEFINIDO:'Não definido / Em análise',OPERACIONAL:'Operacional',MAQUINA:'Máquina',PROCESSO:'Processo',PRODUTO:'Produto (suspeita)',TESTE_INSPECAO:'Teste / Inspeção',OUTRO:'Outro'};
      return map[String(value||'NAO_DEFINIDO').toUpperCase()] || value || 'Não definido / Em análise';
    }
    function operationalRow(r) {
      const classification=r.classification || (r.occurrenceMode==='MAQUINA'?'MAQUINA':(r.category==='Processo'?'PROCESSO':'NAO_DEFINIDO'));
      return `<tr data-op-id="${esc(r.id)}"><td><span class="identifier">${esc(r.id)}</span><span class="secondary-text">${formatDate(r.createdAt)}</span></td><td><span class="identifier">${esc(r.product||'Sem produto')}</span><span class="secondary-text">${esc(r.component||r.peca_danificada||'Sem componente')}</span></td><td><span class="identifier">${esc(r.maquina||'—')}</span><span class="secondary-text">${esc(r.estacao||'Sem posto')} · ${esc(r.linha||'Sem linha')}</span></td><td><span class="identifier">${esc(failureClassificationLabel(classification))}</span><span class="secondary-text">${esc(r.processo||r.category||'Processo não informado')}</span></td><td><span class="wrap">${esc(r.issue||'')}</span><span class="secondary-text">${esc(r.detection_moment_label||r.detectionMoment||r.onde_detectado||'Momento/local não informado')}</span></td><td>${chip(operationalStatus(r))}</td></tr>`;
    }
    function renderOperations() {
      const search=document.querySelector('#opSearch')?.value.toLowerCase().trim()||'';
      const status=document.querySelector('#opStatus')?.value||'';
      const category=document.querySelector('#opCategory')?.value||'';
      const filtered=ordered(state.operationalFailures.filter(r=>{
        const text=[r.id,r.family,r.product,r.component,r.category,r.classification,r.maquina,r.linha,r.estacao,r.processo,r.onde_detectado,r.issue,r.owner,r.hypothesis,r.cause,r.correctiveAction].join(' ').toLowerCase();
        const cls=String(r.classification||'NAO_DEFINIDO').toUpperCase();
        return (!search||text.includes(search))&&(!status||operationalStatus(r)===status)&&(!category||cls===category);
      }));
      document.querySelector('#opRows').innerHTML=filtered.map(operationalRow).join('');
      document.querySelector('#opEmpty').classList.toggle('hidden',filtered.length>0);
      document.querySelector('#opTotalCount').textContent=state.operationalFailures.length;
      document.querySelector('#opOpenCount').textContent=state.operationalFailures.filter(r=>operationalStatus(r)!=='concluido').length;
      document.querySelector('#opStationCount').textContent=new Set(state.operationalFailures.map(r=>r.estacao).filter(Boolean)).size;
      document.querySelector('#opWaitingCount').textContent=state.operationalFailures.filter(r=>String(r.classification||'NAO_DEFINIDO').toUpperCase()==='NAO_DEFINIDO').length;
    }

    function activityRow(activity) {
      const assignment=normalizeAssignment(activity);
      const who=assignment.mode==='open' ? 'Aberta para todos' : assignment.assignees.join(', ') || activity.owner || '—';
      return `<tr data-activity="${activity.id}"><td><span class="identifier">${esc(activity.title)}</span><span class="secondary-text wrap">${esc(activity.description)}</span></td><td><span class="identifier">${esc(activity.type)}</span><span class="secondary-text">${esc(activity.area)}</span></td><td>${esc(who)}</td><td>${activity.dueDate ? formatDate(activity.dueDate) : '—'}</td><td>${safeLink(activity.link, 'Abrir link') || '<span class="muted">—</span>'}</td><td>${activityChip(activity.status)}</td></tr>`;
    }

    function renderWork() {
      setOptions('#workProduct', state.products.map(p => p.code), 'Todos');
      const search = document.querySelector('#workSearch').value.toLowerCase().trim();
      const product = document.querySelector('#workProduct').value;
      const owner = document.querySelector('#workOwner').value;
      const status = document.querySelector('#workStatus').value;
      const filtered = ordered(state.activities.filter(activity => {
        const assignment=normalizeAssignment(activity);
        const text = [activity.title, activity.type, activity.area, activity.description, activity.owner, ...(assignment.assignees||[])].join(' ').toLowerCase();
        return (!search || text.includes(search)) && (!product || activity.product === product) && (!owner || assignment.assignees.includes(owner) || activity.owner === owner) && (!status || activity.status === status);
      }));
      document.querySelector('#workRows').innerHTML = filtered.map(activityRow).join('');
      document.querySelector('#workEmpty').classList.toggle('hidden', filtered.length > 0);
    }

    function flowRow(flow) {
      const steps = completedFlowSteps(flow), done = Object.values(steps).filter(Boolean).length;
      return `<tr data-flow="${flow.id}"><td><span class="identifier">${esc(flow.id)}</span><span class="secondary-text">${esc(flow.product || 'Sem produto relacionado')}</span></td><td><span class="identifier">${esc(flow.scope)}</span><span class="secondary-text wrap">${esc(flow.description)}</span></td><td>${esc(flow.creator)}</td><td>${done}/3 concluídas</td><td>${esc(flow.followUpOwner)}</td><td>${activityChip(calculatedFlowStatus(flow))}</td></tr>`;
    }

    function renderFlows() {
      setOptions('#flowProductFilter', state.products.map(p => p.code), 'Todos');
      const search = document.querySelector('#flowSearch').value.toLowerCase().trim();
      const product = document.querySelector('#flowProductFilter').value;
      const owner = document.querySelector('#flowOwner').value;
      const status = document.querySelector('#flowStatus').value;
      const filtered = ordered(state.flows.filter(flow => {
        const text = [flow.id, flow.product, flow.scope, flow.description, flow.creator, flow.followUpOwner].join(' ').toLowerCase();
        return (!search || text.includes(search)) && (!product || flow.product === product) && (!owner || flow.followUpOwner === owner) && (!status || calculatedFlowStatus(flow) === status);
      }));
      document.querySelector('#flowRows').innerHTML = filtered.map(flowRow).join('');
      document.querySelector('#flowEmpty').classList.toggle('hidden', filtered.length > 0);
    }

    // Estado exclusivo do detalhamento do Dashboard.
    // O painel não é atualizado por renderDashboard(); ele só muda quando o
    // usuário escolhe outro indicador. Isso evita conteúdo de um indicador
    // antigo aparecer dentro do painel atual.
    let dashboardIndicatorKind = null;
    let dashboardIndicatorRenderToken = 0;

    function isProductReport(report){
      const tipo = String(report?.tipo_falha ?? 'PRODUTO').trim().toUpperCase();
      return tipo === 'PRODUTO' || tipo === '';
    }

    function dashboardProductReports(){
      // Fonte única das FALHAS DE PRODUTO.
      // Registros operacionais/máquinas continuam em state.operationalFailures.
      // Aceita registros legados sem tipo_falha e variações de caixa/espaços.
      return Array.isArray(state.reports) ? state.reports.filter(isProductReport) : [];
    }

    function dashboardMonthReports(productReports, referenceDate = new Date()){
      const year = referenceDate.getFullYear();
      const month = referenceDate.getMonth();
      return productReports.filter(r => {
        const d = new Date(r.createdAt || 0);
        return !Number.isNaN(d.getTime()) && d.getFullYear() === year && d.getMonth() === month;
      });
    }

    function dashboardIndicatorData(kind){
      const productReports = dashboardProductReports();
      const monthReports = dashboardMonthReports(productReports);
      if(kind === 'month') return {title:'Falhas registradas no mês atual', subtitle:'Reports de produto criadas no mês vigente.', items:monthReports, label:'falha(s) no mês'};
      if(kind === 'resolution') return {title:'Reports resolvidos', subtitle:'Reports de produto cujo status está concluído.', items:productReports.filter(r => calculatedStatus(r) === 'concluido'), label:'report(s) concluído(s)'};
      if(kind === 'open') return {title:'Falhas Críticas / Abertas', subtitle:'Reports de produto que continuam abertas e precisam de tratamento.', items:productReports.filter(r => calculatedStatus(r) === 'pendente'), label:'falha(s) aberta(s)'};
      if(kind === 'waiting') return {title:'Pendência de Resposta', subtitle:'Reports de produto aguardando retorno do fornecedor.', items:productReports.filter(r => calculatedStatus(r) === 'aguardando'), label:'falha(s) aguardando'};
      return {title:'Detalhamento', subtitle:'', items:[], label:'item(s)'};
    }

    function dashboardIndicatorItem(r){
      const secondary = [r.product || 'Sem produto', r.family || '', r.component || 'Componente não informado', formatDate(r.createdAt)].filter(Boolean).join(' · ');
      const status = chip(calculatedStatus(r));
      return `<button type="button" class="dashboard-detail-item" data-dashboard-report="${esc(r.id)}"><div><strong>${esc(r.id || 'Registro')}</strong><span class="secondary-text">${esc(secondary)}</span><span class="secondary-text">${esc(r.issue || r.defectCode || 'Sem descrição')}</span></div><div class="dashboard-detail-count">${status}</div></button>`;
    }

    function dashboardIndicatorChart(items, kind){
      if(!items.length) return '';
      const counts = {};
      if(kind === 'month'){
        items.forEach(r=>{ const d = new Date(r.createdAt || 0); const key = `Dia ${d.getDate()}`; counts[key]=(counts[key]||0)+1; });
      } else {
        items.forEach(r=>{ const s=calculatedStatus(r); counts[s]=(counts[s]||0)+1; });
      }
      const entries=Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,8);
      const max=Math.max(...entries.map(e=>e[1]),1);
      return `<div class="dashboard-mini-chart">${entries.map(([label,val])=>`<div class="dashboard-chart-row"><span>${esc(label)}</span><div class="dashboard-chart-track"><div class="dashboard-chart-fill" style="width:${(val/max)*100}%"></div></div><strong>${val}</strong></div>`).join('')}</div>`;
    }

    function renderDashboardIndicator(kind, options={}){
      if (!kind) return;

      const data = dashboardIndicatorData(kind);
      const panel = document.querySelector('#dashboardIndicatorPanel');
      const title = document.querySelector('#dashboardInlineTitle');
      const subtitle = document.querySelector('#dashboardInlineSubtitle');
      const content = document.querySelector('#dashboardInlineContent');
      if (!panel || !title || !subtitle || !content) return;

      const token = ++dashboardIndicatorRenderToken;
      panel.dataset.dashboardRenderedIndicator = kind;

      document.querySelectorAll('[data-dashboard-indicator]').forEach(card => {
        card.classList.toggle('dashboard-indicator-selected', card.dataset.dashboardIndicator === kind);
      });

      title.textContent = data.title;
      subtitle.textContent = data.subtitle;

      const sortedItems = data.items.slice().sort((a,b) =>
        new Date(b.createdAt || 0) - new Date(a.createdAt || 0)
      );

      content.innerHTML = `
        <div class="dashboard-detail-summary">
          <strong>${data.items.length}</strong>
          <span>${data.label}</span>
        </div>
        ${dashboardIndicatorChart(data.items, kind)}
        ${sortedItems.length
          ? `<div class="dashboard-detail-list">${sortedItems.map(r => dashboardIndicatorItem(r)).join('')}</div>`
          : `<div class="dashboard-detail-empty">Nenhum registro encontrado para este indicador.</div>`}
      `;

      // Só permite abrir registros pertencentes ao painel que acabou de ser
      // renderizado. O token também protege contra chamadas antigas.
      if (token !== dashboardIndicatorRenderToken || dashboardIndicatorKind !== kind) return;

      content.querySelectorAll('[data-dashboard-report]').forEach(el => {
        el.addEventListener('click', () => {
          if (dashboardIndicatorKind === kind) openDetail(el.dataset.dashboardReport);
        });
      });

      panel.classList.remove('hidden');
      panel.hidden = false;
      panel.style.display = 'block';
      if (options.scroll !== false) panel.scrollIntoView({behavior:'smooth', block:'start'});
    }

    function openDashboardIndicator(kind){
      if (!kind) return;
      activeView = 'dashboard';
      dashboardIndicatorKind = kind;
      renderDashboardIndicator(kind);
    }

    function clearDashboardIndicator(){
      dashboardIndicatorKind = null;
      dashboardIndicatorRenderToken++;
      const panel = document.querySelector('#dashboardIndicatorPanel');
      if (panel) {
        panel.classList.add('hidden');
        panel.hidden = true;
        panel.style.display = '';
        delete panel.dataset.dashboardRenderedIndicator;
      }
      document.querySelectorAll('[data-dashboard-indicator]').forEach(card => card.classList.remove('dashboard-indicator-selected'));
    }

    function renderDashboard() {
      const dNow = new Date();
      const currentYear = dNow.getFullYear();
      const currentMonth = dNow.getMonth();

      const productReports = dashboardProductReports();
      const monthReports = dashboardMonthReports(productReports, dNow);

      const totalMonth = monthReports.length;
      document.querySelector('#dashTotalMonth').textContent = totalMonth;

      const totalAll = productReports.length;
      const countDone = dashboardIndicatorData('resolution').items.length;
      const countWaiting = dashboardIndicatorData('waiting').items.length;
      const countPending = dashboardIndicatorData('open').items.length;

      const resRate = totalAll ? Math.round((countDone / totalAll) * 100) : 0;
      document.querySelector('#dashResolutionRate').textContent = `${resRate}%`;
      document.querySelector('#dashOpenCount').textContent = countPending;
      document.querySelector('#dashAwaitingCount').textContent = countWaiting;

      const compCounts = monthReports.reduce((acc, r) => {
        const c = r.component || 'Indefinido';
        acc[c] = (acc[c] || 0) + 1;
        return acc;
      }, {});

      const sortedComps = Object.entries(compCounts).sort((a, b) => b[1] - a[1]).slice(0, 3);
      const topListEl = document.querySelector('#dashTopComponents');
      const topEmptyEl = document.querySelector('#dashTopEmpty');

      if (sortedComps.length) {
        topListEl.innerHTML = sortedComps.map(([comp, val], idx) => `
          <div class="rank-item">
            <div style="display:flex; align-items:center;">
              <div class="rank-badge">${idx + 1}</div>
              <div>
                <strong class="identifier">${esc(comp)}</strong>
                <span class="secondary-text">${val} ${val === 1 ? 'ocorrência' : 'ocorrências'} neste mês</span>
              </div>
            </div>
            <span class="status pending">${Math.round((val / (totalMonth || 1)) * 100)}% do mês</span>
          </div>
        `).join('');
        topEmptyEl.classList.add('hidden');
      } else {
        topListEl.innerHTML = '';
        topEmptyEl.classList.remove('hidden');
      }

      document.querySelector('#dashCountDone').textContent = countDone;
      document.querySelector('#dashCountWaiting').textContent = countWaiting;
      document.querySelector('#dashCountPending').textContent = countPending;
      document.querySelector('#dashProgressPercent').textContent = `${resRate}% finalizado`;

      if (totalAll > 0) {
        document.querySelector('#dashBarDone').style.width = `${(countDone / totalAll) * 100}%`;
        document.querySelector('#dashBarWaiting').style.width = `${(countWaiting / totalAll) * 100}%`;
        document.querySelector('#dashBarPending').style.width = `${(countPending / totalAll) * 100}%`;
      } else {
        document.querySelector('#dashBarDone').style.width = '0%';
        document.querySelector('#dashBarWaiting').style.width = '0%';
        document.querySelector('#dashBarPending').style.width = '0%';
      }

      // Importante: não re-renderizar o painel de detalhe aqui.
      // A seleção do indicador é controlada exclusivamente por openDashboardIndicator().
    }

    function renderProfile() {
      if (!currentAccount) return;
      const userName = currentAccount.name;
      const userReports = state.reports.filter(r => isAssignedToCurrentUser(r));
      const userDone = userReports.filter(r => calculatedStatus(r) === 'concluido');
      const userPending = userReports.filter(r => calculatedStatus(r) !== 'concluido');
      const userWork = state.activities.filter(a => isAssignedToCurrentUser(a)).length + state.flows.filter(f => f.followUpOwner === userName || normalizeAssignment(f).assignees.includes(userName)).length;

      document.querySelector('#userReportCount').textContent = userReports.length;
      document.querySelector('#userDoneCount').textContent = userDone.length;
      document.querySelector('#userPendingCount').textContent = userPending.length;
      document.querySelector('#userWorkCount').textContent = userWork;

      const userRowsEl = document.querySelector('#userReportRows');
      if (userReports.length) {
        userRowsEl.innerHTML = userReports.map(r => `
          <tr data-id="${r.id}">
            <td><span class="identifier">${esc(r.id)}</span><span class="secondary-text">${formatDate(r.createdAt)}</span></td>
            <td><span class="identifier">${esc(r.product)}</span><span class="secondary-text">${esc(r.family)}</span></td>
            <td><span class="identifier">${esc(r.component || r.maquina || 'Geral')}</span><span class="secondary-text wrap">${esc(r.issue)}</span></td>
            <td>${linksCell(r)}</td>
            <td>${chip(calculatedStatus(r))}</td>
          </tr>
        `).join('');
        document.querySelector('#userReportEmpty').classList.add('hidden');
      } else {
        userRowsEl.innerHTML = '';
        document.querySelector('#userReportEmpty').classList.remove('hidden');
      }

      const isAdmin = currentAccount.role === 'admin';
      const adminSection = document.querySelector('#adminUsersSection');
      adminSection.classList.toggle('hidden', !isAdmin);

      if (isAdmin) {
        document.querySelector('#adminUserRows').innerHTML = users.map(u => `
          <tr>
            <td><span class="identifier">${esc(u.name)}</span></td>
            <td>${esc(u.email)}</td>
            <td><span class="status ${u.role === 'admin' ? 'done' : 'waiting'}">${u.role === 'admin' ? 'Administrador' : 'Usuário Normal'}</span></td>
            <td>
              <div class="user-actions">
                ${u.email !== currentAccount.email && u.email !== ADMIN_EMAIL ? `
                  <button class="button secondary" onclick="toggleUserRole('${u.email}')">${u.role === 'admin' ? 'Tornar Usuário' : 'Promover a Adm'}</button>
                  <button class="button ${u.disabled ? 'secondary' : 'danger'}" onclick="toggleUserDisabled('${u.email}')">${u.disabled ? 'Reativar' : 'Desativar'}</button>
                ` : '<span class="muted">(Conta protegida)</span>'}
              </div>
            </td>
          </tr>
        `).join('');
      }
    }

    function renderAccount() {
      const accountInfoEl = document.querySelector('#accountInfo');
      const appEl = document.querySelector('.app');
      const accountScreenEl = document.querySelector('#accountScreen');

      if (currentAccount) {
        const roleLabel = currentAccount.role === 'admin' ? 'Administrador' : 'Usuário Normal';
        accountInfoEl.textContent = `${currentAccount.name} (${roleLabel}) · ${currentAccount.email}`;
      } else {
        accountInfoEl.textContent = 'Conta não configurada';
      }

      // Só revela uma das interfaces depois que o Firebase responder.
      appEl.classList.toggle('auth-ready', authReady && Boolean(currentAccount));
      accountScreenEl.classList.toggle('hidden', !authReady || Boolean(currentAccount));
    }

    

    function setHomeCentralMode() {
      const track = document.querySelector('#centralTrack');
      if (!track) return;
      const isTeam = homeCentralMode === 'team';
      track.classList.toggle('team-mode', isTeam);
      document.querySelectorAll('.central-switch-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.centralMode === homeCentralMode));
      const title = document.querySelector('#centralSectionTitle');
      const subtitle = document.querySelector('#centralSectionSubtitle');
      if (title) title.textContent = isTeam ? 'Central da equipe' : 'Minha Central Hoje';
      if (subtitle) subtitle.textContent = isTeam ? 'Tarefas abertas que qualquer pessoa da equipe pode assumir.' : 'O que precisa da sua atenção primeiro.';
    }

function renderHome() {
      const productOpenAll = state.reports.filter(report => isProductReport(report) && calculatedStatus(report) !== 'concluido');
      const operationalOpenAll = state.operationalFailures.filter(r => operationalStatus(r)!=='concluido');
      const activitiesOpenAll = state.activities.filter(activity => activity.status !== 'concluido');
      const flowsOpenAll = state.flows.filter(flow => calculatedFlowStatus(flow) !== 'concluido');

      const productOpen = productOpenAll.filter(isVisibleInMyCentral);
      const operationalOpen = operationalOpenAll.filter(isVisibleInMyCentral);
      const activitiesOpen = activitiesOpenAll.filter(isVisibleInMyCentral);
      const flowsOpen = flowsOpenAll.filter(isVisibleInMyCentral);

      document.querySelector('#homePending').textContent = productOpen.length + operationalOpen.length + activitiesOpen.length + flowsOpen.length;
      document.querySelector('#homeProductOpen').textContent = productOpen.length;
      document.querySelector('#homeActivities').textContent = activitiesOpen.length + flowsOpen.length;
      document.querySelector('#homeWaiting').textContent =
        productOpen.filter(report => calculatedStatus(report) === 'aguardando').length +
        operationalOpen.filter(r => operationalStatus(r) === 'aguardando').length +
        activitiesOpen.filter(a => activityEffectiveStatus(a) === 'aguardando').length;

      const tasks = [
        ...activitiesOpen.map(activity => ({ kind:'activity', item:activity, sort:activity.dueDate ? new Date(`${activity.dueDate}T12:00:00`) : new Date(activity.createdAt) })),
        ...productOpen.map(report => ({ kind:'report', item:report, sort:new Date(report.createdAt) })),
        ...operationalOpen.map(item => ({ kind:'operational', item, sort:new Date(item.createdAt) })),
        ...flowsOpen.map(flow => ({ kind:'flow', item:flow, sort:new Date(flow.createdAt) }))
      ].sort((a,b)=>a.sort-b.sort).slice(0,7);

      document.querySelector('#homeQueue').innerHTML = tasks.map(task =>
        task.kind==='activity'
          ? `<div class="home-item" data-activity="${task.item.id}"><span class="home-item-type">${esc(task.item.type)}</span><div><span class="identifier">${esc(task.item.title)}</span><span class="secondary-text">${esc(task.item.area)} · ${esc(task.item.owner)}</span></div>${activityChip(task.item.status)}</div>`
          : task.kind==='flow'
          ? `<div class="home-item" data-flow="${task.item.id}"><span class="home-item-type">Fluxo</span><div><span class="identifier">${esc(task.item.scope)}</span><span class="secondary-text">${esc(task.item.product || 'Sem produto')} · seguimento: ${esc(task.item.followUpOwner)}</span></div>${activityChip(calculatedFlowStatus(task.item))}</div>`
          : task.kind==='operational'
          ? `<div class="home-item" data-op-id="${task.item.id}"><span class="home-item-type">${task.item.occurrenceMode==='MAQUINA'?'Máquina':'Falha operacional'}</span><div><span class="identifier">${esc(task.item.maquina || task.item.estacao || task.item.id)}</span><span class="secondary-text">${esc(task.item.category || 'Outro')} · ${esc(task.item.issue)}</span></div>${chip(operationalStatus(task.item))}</div>`
          : `<div class="home-item" data-id="${task.item.id}"><span class="home-item-type">Produto</span><div><span class="identifier">${esc(task.item.product)} · ${esc(task.item.component || 'Falha')}</span><span class="secondary-text">${esc(task.item.issue)}</span></div>${chip(calculatedStatus(task.item))}</div>`
      ).join('');

      document.querySelector('#homeQueueEmpty').classList.toggle('hidden', tasks.length>0);

      const reminders = currentAccount ? [
        ...activitiesOpen.map(activity => `<div class="notification"><strong>${esc(activity.title)}</strong><span>${activity.dueDate && daysLate(activity.dueDate)>0 ? `Atrasada há ${daysLate(activity.dueDate)} dias.` : activityEffectiveStatus(activity)==='aguardando' ? 'Aguardando resposta ou outra ação.' : 'Pendência atribuída a você.'}</span></div>`),
        ...flowsOpen.map(flow => `<div class="notification"><strong>Fluxo ${esc(flow.id)}</strong><span>Você é responsável pelo seguimento.</span></div>`)
      ].slice(0,4) : [];
      document.querySelector('#notificationList').innerHTML = reminders.length ? reminders.join('') : '<div class="notification"><strong>Sem pendências pessoais</strong><span>Tarefas atribuídas a você aparecerão aqui.</span></div>';
      renderPriorities();
      renderTeamCentral();
      setHomeCentralMode();
    }

    // Controla exclusivamente qual interface principal fica visível.
    // É executado ANTES das rotinas de renderização para que um erro em
    // qualquer módulo não deixe a tela anterior presa.
    
// V15.0.5 — CORA como view realmente independente da Central.
let coraRoutePlaceholder = null;
let coraRouteDetached = false;

function enterCoraRoute() {
  const shell = document.querySelector('#aiAnalysisView');
  if (!shell || coraRouteDetached) return;
  const context = document.querySelector('#aiInvestigationContext');
  const chatScroll = document.querySelector('#aiChatScroll');
  coraRoutePlaceholder = document.createComment('CORA_VIEW_PLACEHOLDER');
  shell.parentNode?.insertBefore(coraRoutePlaceholder, shell);
  document.body.appendChild(shell);
  shell.dataset.coraRoute = 'true';
  shell.classList.remove('hidden');
  // O contexto pertence à conversa, não ao cabeçalho.
  if (context && chatScroll && !chatScroll.contains(context)) {
    chatScroll.insertBefore(context, chatScroll.firstChild);
  }
  coraRouteDetached = true;
  document.body.classList.add('cora-route-active');
  document.documentElement.classList.add('cora-route-active');
  document.body.style.overflow = '';
  window.scrollTo({ top: 0, behavior: 'auto' });
}

function exitCoraRoute() {
  const shell = document.querySelector('#aiAnalysisView');
  if (!coraRouteDetached || !shell) return;
  const context = document.querySelector('#aiInvestigationContext');
  const content = document.querySelector('.content');
  if (context && content && !content.contains(context)) {
    // Ao sair, devolve o contexto ao shell para o estado normal da página.
    const chatShell = content.querySelector('.ai-chat-shell');
    if (chatShell && context.parentElement !== chatShell) chatShell.insertBefore(context, chatShell.firstChild);
  }
  if (coraRoutePlaceholder?.parentNode) coraRoutePlaceholder.parentNode.insertBefore(shell, coraRoutePlaceholder.nextSibling);
  coraRoutePlaceholder?.remove();
  coraRoutePlaceholder = null;
  shell.classList.add('hidden');
  shell.removeAttribute('data-cora-route');
  coraRouteDetached = false;
  document.body.classList.remove('cora-route-active');
  document.documentElement.classList.remove('cora-route-active');
  document.body.style.overflow = '';
}

function applyCoraPageLayout(active) {
  const body = document.body;
  const shell = document.querySelector('#aiAnalysisView');
  const appRoot = document.querySelector('.app');
  if (!body || !shell) return;
  body.classList.toggle('ai-focus-mode', Boolean(active));
  body.classList.toggle('cora-route-active', Boolean(active));
  document.documentElement.classList.toggle('cora-route-active', Boolean(active));
  if (appRoot) appRoot.style.display = active ? 'none' : '';
  if (active) {
    shell.style.display = 'block';
    shell.style.width = '100vw';
    shell.style.minHeight = '100vh';
    shell.style.height = 'auto';
    shell.style.margin = '0';
    shell.style.padding = '0';
    shell.style.overflow = '';
  } else {
    shell.style.display = '';
    shell.style.width = '';
    shell.style.minHeight = '';
    shell.style.height = '';
    shell.style.margin = '';
    shell.style.padding = '';
    shell.style.overflow = '';
  }
}
function applyActiveView() {
      applyCoraPageLayout(activeView === 'aiAnalysis');
      document.body.classList.toggle('ai-focus-mode', activeView === 'aiAnalysis');
      const views = {
        home: '#homeView',
        dashboard: '#dashboardView',
        profile: '#profileView',
        product: '#productView',
        operations: '#operationsView',
        all: '#allReportsView',
        work: '#workView',
        flow: '#flowView',
        aiAnalysis: '#aiAnalysisView'
      };

      Object.entries(views).forEach(([name, selector]) => {
        const el = document.querySelector(selector);
        if (el) el.classList.toggle('hidden', activeView !== name);
      });

      document.querySelectorAll('.main-nav button').forEach(button => {
        button.classList.toggle('active', button.dataset.page === activeView);
      });
    }


    // ========================= V14.0 — IA DE ANÁLISE =========================
    let aiActiveAbortController = null;
const aiPilot = {
      mode: 'data',
      perspective: 'COMPLETA',
      rows: [],
      columns: [],
      source: 'manual',
      lastResult: null,
      context: ''
    };

    const aiEsc = value => esc(String(value ?? ''));
    const aiTasks = () => [...document.querySelectorAll('[data-ai-task]:checked')].map(x => x.dataset.aiTask);
    const aiNormalizeKey = key => String(key ?? '').toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'');
    const aiFindColumn = (row, names) => {
      const keys = Object.keys(row || {});
      const normalized = keys.map(k => [k, aiNormalizeKey(k)]);
      for (const name of names) {
        const n = aiNormalizeKey(name);
        const found = normalized.find(([k,v]) => v === n || v.includes(n) || n.includes(v));
        if (found) return found[0];
      }
      return null;
    };
    const aiValue = (row, names) => { const k=aiFindColumn(row,names); return k ? String(row[k] ?? '').trim() : ''; };
    const aiCountBy = (rows, names) => {
      const map = new Map(); rows.forEach(r=>{const v=aiValue(r,names); if(v) map.set(v,(map.get(v)||0)+1);});
      return [...map.entries()].sort((a,b)=>b[1]-a[1]);
    };
    const aiNum = v => { const n=Number(String(v??'').replace(/[^0-9,.-]/g,'').replace(/\\.(?=.*\\.)/g,'').replace(',','.')); return Number.isFinite(n)?n:0; };
    const aiQuantityTotal = rows => {
      const k = rows[0] ? aiFindColumn(rows[0],['quantidade','qtd','quantity','qty']) : null;
      if(!k) return rows.length;
      const total=rows.reduce((s,r)=>s+aiNum(r[k]),0); return total || rows.length;
    };
    function aiTopText(rows,names,label){
      const top=aiCountBy(rows,names).slice(0,5); if(!top.length) return `<li>Não há coluna identificável para ${aiEsc(label)}.</li>`;
      return top.map(([k,v])=>`<li><strong>${aiEsc(k)}</strong> — ${v} registro(s).</li>`).join('');
    }
    function aiCross(rows,aNames,bNames,aLabel,bLabel){
      const map=new Map(); rows.forEach(r=>{const a=aiValue(r,aNames),b=aiValue(r,bNames);if(a&&b){const k=`${a} × ${b}`;map.set(k,(map.get(k)||0)+1);}});
      const top=[...map.entries()].sort((a,b)=>b[1]-a[1]).slice(0,7);
      if(!top.length)return `<li>Não existem dados suficientes para ${aiEsc(aLabel)} × ${aiEsc(bLabel)}.</li>`;
      return top.map(([k,v])=>`<li><strong>${aiEsc(k)}</strong> — ${v} ocorrência(s).</li>`).join('');
    }
    function aiLocalAnalysis(){
      const rows=aiPilot.rows||[]; const context=aiPilot.context.trim(); const total=aiQuantityTotal(rows);
      const products=aiCountBy(rows,['produto','modelo','product','model']);
      const defects=aiCountBy(rows,['defeito','falha','problema','defect','failure','issue']);
      const lines=aiCountBy(rows,['linha','line']); const stations=aiCountBy(rows,['estacao','estação','station']);
      const comps=aiCountBy(rows,['componente','component','material']); const suppliers=aiCountBy(rows,['fornecedor','supplier','vendor']);
      const lots=aiCountBy(rows,['lote','lot','batch']); const shifts=aiCountBy(rows,['turno','shift']);
      const hypotheses=[];
      const text=(context+' '+defects.slice(0,3).map(x=>x[0]).join(' ')).toLowerCase();
      if(suppliers.length||lots.length||/fornecedor|lote|material|componente/.test(text)) hypotheses.push({cat:'Material',name:'Existe possível relação entre material/componente, fornecedor ou lote e a ocorrência.',confidence:suppliers.length||lots.length?'Alta':'Média',status:'Hipótese — não confirmada'});
      if(lines.length||stations.length||/linha|estacao|estação|operacao|operação|processo|sop/.test(text)) hypotheses.push({cat:'Method',name:'O defeito pode estar concentrado em processo, operação ou estação específica.',confidence:(lines.length||stations.length)?'Média':'Baixa',status:'Hipótese — não confirmada'});
      if(/maquina|máquina|equipamento|parametro|parâmetro/.test(text)||stations.length) hypotheses.push({cat:'Machine',name:'A estação/equipamento pode ser fator contribuinte; é necessário separar ponto de detecção de ponto de geração.',confidence:stations.length?'Média':'Baixa',status:'Hipótese — não confirmada'});
      if(shifts.length||/operador|turno|mao de obra|mão de obra/.test(text)) hypotheses.push({cat:'Man',name:'Pode existir concentração por operador ou turno.',confidence:shifts.length?'Média':'Baixa',status:'Hipótese — não confirmada'});
      if(!hypotheses.length) hypotheses.push({cat:'6M',name:'Não há dados suficientes para priorizar uma causa. Primeiro devemos aumentar a evidência.',confidence:'Baixa',status:'Hipótese — não confirmada'});
      const patterns=[];
      if(products.length) patterns.push(`Produto mais concentrado: ${products[0][0]} (${products[0][1]} registros).`);
      if(defects.length) patterns.push(`Defeito mais frequente: ${defects[0][0]} (${defects[0][1]} registros).`);
      if(lots.length) patterns.push(`Lote com maior concentração: ${lots[0][0]} (${lots[0][1]} registros).`);
      if(suppliers.length) patterns.push(`Fornecedor com maior concentração: ${suppliers[0][0]} (${suppliers[0][1]} registros).`);
      if(stations.length) patterns.push(`Estação com maior concentração: ${stations[0][0]} (${stations[0][1]} registros).`);
      if(lines.length) patterns.push(`Linha com maior concentração: ${lines[0][0]} (${lines[0][1]} registros).`);
      if(!patterns.length && context) patterns.push('O contexto foi recebido, mas ainda não existem dados tabulares suficientes para quantificar concentrações.');
      const questions=[
        'O local onde a falha foi detectada é realmente o local onde ela foi gerada?',
        'A falha já existia antes da operação ou surgiu depois dela?',
        'Existe concentração por lote, fornecedor, turno, linha ou estação?',
        'Qual evidência poderia refutar a hipótese principal?'
      ];
      const tests=[
        'Comparar peças antes e depois da operação suspeita.',
        'Comparar lotes/fornecedores e períodos sem ocorrência.',
        'Separar ponto de geração da falha do ponto de detecção.',
        'Repetir o teste em amostra controlada e registrar o resultado.'
      ];
      const actions=[
        {action:'Segregar/identificar lote ou produto afetado',type:'Contenção',status:'Aberta'},
        {action:'Aumentar amostragem enquanto a hipótese estiver em investigação',type:'Contenção',status:'Aberta'},
        {action:'Verificar processo, SOP e condição da estação relacionada',type:'Correção',status:'Aberta'},
        {action:'Registrar causa confirmada somente após evidência',type:'Prevenção',status:'Aberta'}
      ];
      return {summary:{records:rows.length,quantity:total,products:products.length,defects:defects.length},patterns,hypotheses,questions,tests,actions,context,source:aiPilot.source,perspective:aiPilot.perspective,generatedAt:new Date().toISOString(),cross:{productDefect:aiCross(rows,['produto','modelo'],['defeito','falha','problema'],'Produto','Defeito'),defectStation:aiCross(rows,['defeito','falha','problema'],['estacao','estação','station'],'Defeito','Estação'),componentSupplier:aiCross(rows,['componente','component','material'],['fornecedor','supplier','vendor'],'Componente','Fornecedor'),supplierLot:aiCross(rows,['fornecedor','supplier','vendor'],['lote','lot','batch'],'Fornecedor','Lote')}};
    }
    function aiRenderResult(result){
      const r=result||{};
      const h=Array.isArray(r.hypotheses)?r.hypotheses:[];
      const p=Array.isArray(r.patterns)?r.patterns:[];
      const qs=Array.isArray(r.questions)?r.questions:[];
      const tests=Array.isArray(r.tests)?r.tests:[];
      const actions=Array.isArray(r.actions)?r.actions:[];
      const summary=r.summary||{};
      const cross=r.cross||{};
      const esc=x=>aiEsc(x==null?'':x);
      const list=items=>items.map(x=>`<li>${esc(x)}</li>`).join('');
      const crossBlock=(title,value)=>{
        if(!value)return '';
        return `<div class="ai-inline-evidence"><strong>${esc(title)}</strong><div>${value}</div></div>`;
      };

      const mainThinking = r.thinking || r.context ||
        'A análise começa pelos fatos disponíveis. Ainda não é seguro tratar uma hipótese como causa confirmada.';

      let htmlOut=`<div class="ai-modern-response">`;

      /* Resposta principal: sempre conversa primeiro. */
      htmlOut+=`<div class="ai-analysis-lead">
        <div class="ai-analysis-label">ANÁLISE</div>
        <div class="ai-analysis-text">${esc(mainThinking)}</div>
      </div>`;

      /* Só mostra fatos resumidos quando realmente existem dados estruturados. */
      const hasSummary = Number(summary.records||0)>0 || Number(summary.quantity||0)>0 ||
                         Number(summary.products||0)>0 || Number(summary.defects||0)>0;
      if(hasSummary){
        htmlOut+=`<div class="ai-analysis-section">
          <div class="ai-analysis-section-title">O que os dados mostram</div>
          <div class="ai-fact-row">
            ${Number(summary.records||0)>0?`<span><strong>${esc(summary.records)}</strong> registros</span>`:''}
            ${Number(summary.quantity||0)>0?`<span><strong>${esc(summary.quantity)}</strong> quantidade</span>`:''}
            ${Number(summary.products||0)>0?`<span><strong>${esc(summary.products)}</strong> produtos</span>`:''}
            ${Number(summary.defects||0)>0?`<span><strong>${esc(summary.defects)}</strong> tipos de falha</span>`:''}
          </div>
        </div>`;
      }

      /* Padrões: apresentados como texto técnico curto, não como uma grade de cartões. */
      if(p.length){
        htmlOut+=`<div class="ai-analysis-section">
          <div class="ai-analysis-section-title">O que chama atenção</div>
          <ul class="ai-modern-list">${list(p)}</ul>
        </div>`;
      }

      /* Hipóteses aparecem somente quando existem. */
      if(h.length){
        htmlOut+=`<div class="ai-analysis-section">
          <div class="ai-analysis-section-title">Hipóteses em investigação</div>
          <div class="ai-hypothesis-flow">${h.map(x=>`
            <div class="ai-hypothesis-inline">
              <div class="ai-hypothesis-main">
                <strong>${esc(x.cat)} — ${esc(x.name)}</strong>
                <span>${esc(x.status||'Hipótese — não confirmada')}</span>
              </div>
              <span class="ai-confidence-inline">${esc(x.confidence||'Não avaliada')}</span>
            </div>`).join('')}</div>
        </div>`;
      }

      /* Cruzamentos: só aparecem quando o motor realmente encontrou algo. */
      const crossItems=[
        ['Produto × Defeito',cross.productDefect],
        ['Defeito × Estação',cross.defectStation],
        ['Componente × Fornecedor',cross.componentSupplier],
        ['Fornecedor × Lote',cross.supplierLot]
      ].filter(x=>x[1] && String(x[1]).trim());

      if(crossItems.length){
        htmlOut+=`<div class="ai-analysis-section">
          <div class="ai-analysis-section-title">Relações encontradas nos dados</div>
          <div class="ai-cross-flow">${crossItems.map(([t,v])=>crossBlock(t,v)).join('')}</div>
        </div>`;
      }

      /* RCA não é forçada: só aparece se o backend tiver uma RCA útil. */
      if(r.rca && String(r.rca).trim()){
        htmlOut+=`<div class="ai-analysis-section">
          <div class="ai-analysis-section-title">Raciocínio de causa</div>
          <div class="ai-rca-inline">${esc(r.rca)}</div>
        </div>`;
      }

      /* Próximo passo: perguntas e testes são priorizados, sem criar blocos vazios. */
      if(qs.length || tests.length){
        htmlOut+=`<div class="ai-analysis-section">
          <div class="ai-analysis-section-title">Para avançar a investigação</div>
          ${qs.length?`<div class="ai-next-block"><div class="ai-next-label">Perguntas que faltam</div><ul class="ai-modern-list">${list(qs)}</ul></div>`:''}
          ${tests.length?`<div class="ai-next-block"><div class="ai-next-label">Teste que eu faria</div><ul class="ai-modern-list">${list(tests)}</ul></div>`:''}
        </div>`;
      }

      if(actions.length){
        htmlOut+=`<div class="ai-analysis-section">
          <div class="ai-analysis-section-title">Ações sugeridas</div>
          <ul class="ai-modern-list">${actions.map(x=>`<li><strong>${esc(x.type||'Ação')}</strong> — ${esc(x.action)}${x.status?` <span class="ai-action-status">${esc(x.status)}</span>`:''}</li>`).join('')}</ul>
        </div>`;
      }

      htmlOut+=`<div class="ai-analysis-disclaimer">
        <span>Fato ≠ hipótese ≠ causa confirmada.</span>
        <span>A investigação evolui conforme novas evidências são adicionadas.</span>
      </div></div>`;

      const host=document.querySelector('#aiResult');
      if(host) host.innerHTML=htmlOut;
    }
    function renderAIDataPreview(){
      const box=document.querySelector('#aiDataPreview'), rows=aiPilot.rows||[]; const count=document.querySelector('#aiRecordCount');
      if(count) count.textContent=`${rows.length} registro(s)`;
      if(!box)return;
      if(!rows.length){box.innerHTML='<div class="ai-empty">Nenhum dado carregado. Você também pode usar apenas o campo de contexto.</div>';return;}
      const cols=aiPilot.columns.length?aiPilot.columns:Object.keys(rows[0]||{}); const sample=rows.slice(0,80);
      box.innerHTML=`<table><thead><tr>${cols.map(c=>`<th>${aiEsc(c)}</th>`).join('')}</tr></thead><tbody>${sample.map(r=>`<tr>${cols.map(c=>`<td>${aiEsc(r[c])}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
    }
    function renderAISummary(){
      const el=document.querySelector('#aiDataSummary'); if(!el)return; const rows=aiPilot.rows||[];
      const q=aiQuantityTotal(rows); const cols=aiPilot.columns.length||Object.keys(rows[0]||{}).length;
      el.innerHTML=`<div class="ai-mini"><strong>${rows.length}</strong><span>registros</span></div><div class="ai-mini"><strong>${q}</strong><span>quantidade</span></div><div class="ai-mini"><strong>${cols}</strong><span>campos</span></div><div class="ai-mini"><strong>${aiEsc(aiPilot.source)}</strong><span>fonte</span></div>`;
    }
    function renderAIAnalysis(){
      const modeButtons=document.querySelectorAll('[data-ai-mode]'); modeButtons.forEach(b=>b.classList.toggle('active',b.dataset.aiMode===aiPilot.mode));
      document.querySelectorAll('[data-ai-perspective]').forEach(b=>b.classList.toggle('active',b.dataset.aiPerspective===aiPilot.perspective));
      const title=document.querySelector('#aiInputTitle'),help=document.querySelector('#aiInputHelp');
      if(title) title.textContent=aiPilot.mode==='think'?'3. O que você está pensando?':'3. Dados + contexto';
      if(help) help.textContent=aiPilot.mode==='think'?'Escreva como você falaria com um colega: observação, dúvida, hipótese, teste ou informação incompleta. A IA organiza o raciocínio.':'Você pode enviar uma planilha, colar uma tabela ou selecionar reports existentes. Use o campo de contexto para explicar o que você já sabe.';
      renderAISummary(); renderAIDataPreview(); renderAIHistory();
    }
    async function aiReadFile(file){
      if(!file)return; const name=file.name.toLowerCase();
      if(name.endsWith('.csv')){ const text=await file.text(); const lines=text.split(/\\r?\\n/).filter(Boolean); if(!lines.length)return; const sep=(lines[0].match(/;/g)||[]).length>(lines[0].match(/,/g)||[]).length?';':','; const parseLine=line=>{let out=[],cur='',q=false;for(let i=0;i<line.length;i++){const ch=line[i];if(ch==='"'){if(q&&line[i+1]==='"'){cur+='"';i++;}else q=!q;}else if(ch===sep&&!q){out.push(cur.trim());cur='';}else cur+=ch;}out.push(cur.trim());return out;}; const heads=parseLine(lines[0]); aiPilot.rows=lines.slice(1).map(line=>{const vals=parseLine(line);const o={};heads.forEach((h,i)=>o[h||`Campo ${i+1}`]=vals[i]??'');return o;}); aiPilot.columns=heads; aiPilot.source=file.name; aiPilot.sourceKnowledge={name:file.name,records:aiPilot.rows.length,columns:aiPilot.columns.slice(0,40)}; renderAIAnalysis(); return; }
      if(!window.XLSX) throw new Error('Leitor de Excel não carregado. Verifique sua conexão e tente novamente.');
      const data=await file.arrayBuffer(); const wb=window.XLSX.read(data,{type:'array'}); const ws=wb.Sheets[wb.SheetNames[0]]; const rows=window.XLSX.utils.sheet_to_json(ws,{defval:''}); aiPilot.rows=rows; aiPilot.columns=rows.length?Object.keys(rows[0]):[]; aiPilot.source=file.name; aiPilot.sourceKnowledge={name:file.name,records:aiPilot.rows.length,columns:aiPilot.columns.slice(0,40)}; renderAIAnalysis();
    }
    function aiUseCentral(){
      // A Central nunca é despejada inteira no prompt. Este atalho apenas sinaliza
      // que a pergunta deve privilegiar a base interna; o backend faz a busca
      // ampla e aplica o filtro de relevância/causalidade.
      aiPilot.source='Central';
      aiPilot.rows=[];
      aiPilot.columns=[];
      aiPilot.focusedCentralContext=[];
      aiUpdateAIState();
      return true;
    }

    async function aiRun(){
      aiPilot.context=document.querySelector('#aiContext')?.value||''; const btn=document.querySelector('#aiRunAnalysis'); if(btn){btn.disabled=true;btn.textContent='Analisando...';}
      try{
        const payload={mode:aiPilot.mode,perspective:aiPilot.perspective,context:aiPilot.context,rows:aiPilot.rows,tasks:aiTasks(),instructions:{factsOnly:true,separateHypothesisFromConfirmedCause:true,use6M:true,allowMultipleCauses:true,askMissingData:true,suggestTests:true,compareHistory:true}};
        let result=null;
        const endpoint=window.FAILURE_AI_ENDPOINT||'/api/failure-analysis';
        try{const res=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});if(res.ok)result=await res.json();}catch(e){console.warn('Endpoint de IA indisponível; usando análise local do piloto.',e);}
        if(!result) result=aiLocalAnalysis();
        aiPilot.lastResult=result; aiRenderResult(result); showSaveToast(result?.aiUnavailable?'IA externa indisponível; resultado local exibido.':'Análise concluída.','success');
      }catch(err){console.error(err);showSaveToast('Não foi possível analisar: '+err.message,'error');}
      finally{if(btn){btn.disabled=false;btn.textContent='🤖 Analisar';}}
    }
    async function aiSave(){
      if(!aiPilot.lastResult){showSaveToast('Faça uma análise antes de salvar.','error');return;}
      const r=aiPilot.lastResult; const title=(aiPilot.context.split(/[.!?\\n]/)[0]||r.patterns?.[0]||'Investigação de falha').slice(0,140);
      try{await addDoc(collection(db,'failureAnalyses'),{id:nextId('FA'),title,problem:aiPilot.context||'',perspective:aiPilot.perspective,mode:aiPilot.mode,source:aiPilot.source,recordCount:aiPilot.rows.length,columns:aiPilot.columns,tasks:aiTasks(),result:r,createdAt:now(),createdBy:currentAccount?.name||'Usuário atual',status:'Em análise'});showSaveToast('Investigação salva.','success');}
      catch(err){console.error(err);showSaveToast('Não foi possível salvar a investigação: '+err.message,'error');}
    }
    function aiLoadHistory(id){const x=(state.failureAnalyses||[]).find(a=>(a.docId||a.id)===id);if(!x)return;aiPilot.mode=x.mode||'data';aiPilot.perspective=x.perspective||'COMPLETA';aiPilot.context=x.problem||'';aiPilot.source=x.source||'Histórico';aiPilot.rows=[];aiPilot.columns=[];const c=document.querySelector('#aiContext');if(c)c.value=aiPilot.context;aiRenderResult(x.result||{});renderAIAnalysis();}

    // ==================== V15V — OFFLINE / AUDIT / LLMOPS / EXPORT ====================
    const OFFLINE_DB_NAME='central-trabalho-offline'; const OFFLINE_DB_VERSION=1; const OFFLINE_STORE='queue';
    let offlineDbPromise=null;
    function offlineDb(){
      if(offlineDbPromise) return offlineDbPromise;
      offlineDbPromise=new Promise((resolve,reject)=>{const req=indexedDB.open(OFFLINE_DB_NAME,OFFLINE_DB_VERSION);req.onupgradeneeded=()=>{const db=req.result;if(!db.objectStoreNames.contains(OFFLINE_STORE))db.createObjectStore(OFFLINE_STORE,{keyPath:'id'});};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});
      return offlineDbPromise;
    }
    async function queueOfflineWrite(collectionName,payload){const item={id:(crypto.randomUUID?crypto.randomUUID():`${Date.now()}-${Math.random()}`),collection:collectionName,payload,createdAt:now()};try{const dbx=await offlineDb();await new Promise((res,rej)=>{const tx=dbx.transaction(OFFLINE_STORE,'readwrite');tx.objectStore(OFFLINE_STORE).put(item);tx.oncomplete=res;tx.onerror=()=>rej(tx.error);});}catch{const k='centralAI.offline.queue.v1';const arr=JSON.parse(localStorage.getItem(k)||'[]');arr.push(item);localStorage.setItem(k,JSON.stringify(arr.slice(-50)));}return item;}
    async function listOfflineQueue(){let out=[];try{const dbx=await offlineDb();out=await new Promise((res,rej)=>{const tx=dbx.transaction(OFFLINE_STORE,'readonly');const r=tx.objectStore(OFFLINE_STORE).getAll();r.onsuccess=()=>res(r.result||[]);r.onerror=()=>rej(r.error);});}catch{}const localKey='centralAI.offline.queue.v1';try{out=[...out,...JSON.parse(localStorage.getItem(localKey)||'[]')];}catch{}const unique=[...new Map(out.map(x=>[x.id,x])).values()];return unique;}
    async function removeOfflineQueue(id){try{const dbx=await offlineDb();await new Promise((res,rej)=>{const tx=dbx.transaction(OFFLINE_STORE,'readwrite');tx.objectStore(OFFLINE_STORE).delete(id);tx.oncomplete=res;tx.onerror=()=>rej(tx.error);});}catch{}try{const k='centralAI.offline.queue.v1';const arr=JSON.parse(localStorage.getItem(k)||'[]').filter(x=>x.id!==id);localStorage.setItem(k,JSON.stringify(arr));}catch{}}
    async function syncOfflineQueue(){if(!navigator.onLine||!currentAccount)return;const items=await listOfflineQueue().catch(()=>[]);for(const item of items){try{await addDoc(collection(db,item.collection),item.payload);await removeOfflineQueue(item.id);}catch(err){console.warn('Fila offline ainda pendente:',err.message);break;}}if(items.length)showSaveToast('Sincronização offline concluída quando a conexão voltou.','success');}
    let offlineSupportRegistered=false;
function registerOfflineSupport(){
  if(offlineSupportRegistered) return;
  offlineSupportRegistered=true;
  window.addEventListener('online',()=>syncOfflineQueue().catch(()=>{}));window.addEventListener('offline',()=>{const el=document.querySelector('#aiDataState');if(el)el.textContent='Offline: novas evidências serão salvas no dispositivo';});if('serviceWorker' in navigator){navigator.serviceWorker.register('/sw.js',{updateViaCache:'none'}).then(reg=>{reg.update().catch(()=>{});if(reg.sync)reg.sync.register('cora-sync').catch(()=>{});}).catch(e=>console.warn('SW:',e.message));navigator.serviceWorker.addEventListener('message',e=>{if(e.data?.type==='cora-cache-updated'&&e.data?.version==='15.1.13.19'&&localStorage.getItem('cora.sw.loaded')!=='15.1.13.19'){localStorage.setItem('cora.sw.loaded','15.1.13.19');location.reload();}if(e.data?.type==='cora-sync')syncOfflineQueue().catch(()=>{});});}syncOfflineQueue().catch(()=>{});if(navigator.onLine){const el=document.querySelector('#aiDataState');if(el)el.textContent='Conversa · Central · memória · evidências · online';}}
    function auditLocal(event,meta={}){try{const k='centralAI.audit.local.v1';const arr=JSON.parse(localStorage.getItem(k)||'[]');arr.push({event,meta,at:now(),userId:currentAuthUser?.uid||'dev'});localStorage.setItem(k,JSON.stringify(arr.slice(-200)));}catch{}}
    async function auditAI(event,meta={}){auditLocal(event,meta);try{const token=auth?.currentUser?await auth.currentUser.getIdToken():null;const headers={'Content-Type':'application/json'};if(token)headers.Authorization=`Bearer ${token}`;await fetch('/api/ai-audit',{method:'POST',headers,body:JSON.stringify({event,meta,userId:currentAuthUser?.uid||'dev',conversationId:aiPilot.conversationId||null})});}catch(e){console.warn('Audit IA indisponível:',e.message);}}
    async function renderAIMetricsPanel(){const box=document.querySelector('#aiMetricsPanel');if(!box)return;box.innerHTML='<div class="ai-metrics-grid"><div><strong>Carregando…</strong><span>Saúde da IA</span></div></div>';try{const token=auth?.currentUser?await auth.currentUser.getIdToken():null;const headers={};if(token)headers.Authorization=`Bearer ${token}`;const r=await fetch('/api/ai-metrics',{headers});const data=await r.json();if(!r.ok)throw new Error(data.error||'Falha ao carregar métricas');const m=data.metrics||{};box.innerHTML=`<div class="ai-metrics-header"><div><strong>Saúde da IA</strong><p>Telemetria técnica da CORA. Sem conteúdo de conversa.</p></div><span class="ai-metrics-badge">${data.providers?.gemini?'Gemini':''}${data.providers?.openai?' + OpenAI':''}</span></div><div class="ai-metrics-grid"><div><strong>${m.requests||0}</strong><span>Consultas</span></div><div><strong>${m.avgLatencyMs?Math.round(m.avgLatencyMs):0} ms</strong><span>Latência média</span></div><div><strong>${m.fallbackRate?Math.round(m.fallbackRate*100):0}%</strong><span>Fallback</span></div><div><strong>${m.totalTokens||0}</strong><span>Tokens registrados</span></div><div><strong>${m.estimatedCostUsd?m.estimatedCostUsd.toFixed(4):'0.0000'}</strong><span>USD estimado</span></div><div><strong>${m.hypothesesAccepted||0}/${m.hypothesesTracked||0}</strong><span>Hipóteses aceitas</span></div></div>`;}catch(e){box.innerHTML=`<div class="ai-empty-state"><strong>Saúde da IA indisponível.</strong><p>${aiEsc(e.message)}</p></div>`;}}
    function aiExportInvestigation(kind){const r=aiPilot.lastResult||{};const messages=aiPilot.conversation||[];const problem=aiPilot.context||messages.find(m=>m.role==='user')?.text||'Investigação CORA';const title=problem.split(/[.!?\n]/)[0].slice(0,120)||'Investigação CORA';const facts=(r.facts||r.summary||[]);const hypotheses=(r.hypotheses||r.possibleCauses||[]);const tests=(r.tests||r.nextSteps||[]);const cause=r.strongestHypothesis||r.rootCause||r.cause||'Em investigação';
      const escDoc=x=>String(x??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
      let body='';
      if(kind==='8d') body=`<h1>Relatório 8D — ${escDoc(title)}</h1><h2>D2 · Problema</h2><p>${escDoc(problem)}</p><h2>D4 · Causas</h2><p>${escDoc(Array.isArray(hypotheses)?hypotheses.join('; '):hypotheses)}</p><h2>D5 · Causa mais forte</h2><p>${escDoc(cause)}</p><h2>D6 · Testes / Ações</h2><p>${escDoc(Array.isArray(tests)?tests.join('; '):tests)}</p><h2>D7 · Prevenção</h2><p>Definir com base nos resultados confirmados da investigação.</p>`;
      else if(kind==='a3') body=`<h1>A3 — ${escDoc(title)}</h1><h2>Problema</h2><p>${escDoc(problem)}</p><h2>Estado atual / Fatos</h2><p>${escDoc(Array.isArray(facts)?facts.join('; '):facts)}</p><h2>Análise</h2><p>${escDoc(Array.isArray(hypotheses)?hypotheses.join('; '):hypotheses)}</p><h2>Causa em investigação</h2><p>${escDoc(cause)}</p><h2>Plano de ação</h2><p>${escDoc(Array.isArray(tests)?tests.join('; '):tests)}</p>`;
      else body=`<h1>Ishikawa — ${escDoc(title)}</h1><p>Diagrama estruturado a partir das hipóteses atuais da investigação. Hipóteses permanecem hipóteses até confirmação.</p><svg width="100%" viewBox="0 0 1000 520" role="img" aria-label="Diagrama Ishikawa"><line x1="120" y1="260" x2="820" y2="260" stroke="#222" stroke-width="5"/><polygon points="820,260 770,235 770,285" fill="#222"/><rect x="820" y="215" width="150" height="90" rx="12" fill="#f4f4f2" stroke="#222" stroke-width="2"/><text x="895" y="265" text-anchor="middle" font-size="18" font-family="Arial">EFEITO</text>${['Processo','Material','Máquina','Mão de obra','Medição','Ambiente'].map((x,i)=>{const y=i<3?150+55*i:350+55*(i-3);const x2=420+(i%3)*130;const up=i<3;return `<line x1="${x2}" y1="260" x2="${x2-75}" y2="${y}" stroke="#222" stroke-width="3"/><text x="${x2-85}" y="${up?y-10:y+25}" text-anchor="end" font-size="16" font-family="Arial">${x}</text>`}).join('')}</svg><h2>Hipóteses</h2><p>${escDoc(Array.isArray(hypotheses)?hypotheses.join('; '):hypotheses)}</p>`;
      const html=`<!doctype html><html><head><meta charset="utf-8"><title>${escDoc(title)}</title><style>body{font-family:Inter,Arial,sans-serif;max-width:920px;margin:40px auto;padding:0 24px;color:#171717}h1{font-size:28px}h2{font-size:18px;margin-top:28px;border-bottom:1px solid #ddd;padding-bottom:6px}p{line-height:1.6}svg{margin:24px 0}</style></head><body>${body}<p><small>Gerado pela CORA · ${escDoc(now())}</small></p></body></html>`;
      const blob=new Blob([html],{type:'text/html;charset=utf-8'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`CORA-${kind}-${new Date().toISOString().slice(0,10)}.html`;a.click();URL.revokeObjectURL(url);auditAI('export', {kind});showSaveToast(`${kind.toUpperCase()} exportado.`,'success');}
    function aiDownloadBase64File(file){
      const bytes=Uint8Array.from(atob(file.data),c=>c.charCodeAt(0));const blob=new Blob([bytes],{type:file.mime||'application/octet-stream'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=file.name||'CORA-artefato';a.click();setTimeout(()=>URL.revokeObjectURL(url),500);
    }
    function aiArtifactRequestPayload(){
      return {kind:'8d',context:aiPilot.context,result:aiPilot.lastResult||{},images:aiPilot.images.map(x=>({name:x.name,type:x.type,dataUrl:x.dataUrl})),currentReport:aiBuildDynamicCentralContext().currentReport,currentOperationalFailure:aiBuildDynamicCentralContext().currentOperationalFailure,activeProduct:aiBuildDynamicCentralContext().activeProduct,centralData:aiBuildDynamicCentralContext(),conversation:(aiPilot.conversation||[]).slice(-20)};
    }
    async function aiGenerateArtifact(kind){
      const payload=aiArtifactRequestPayload();payload.kind=kind;aiSetThinking(true,`Verificando dados para ${kind.toUpperCase()}…`);
      try{const token=auth?.currentUser?await auth.currentUser.getIdToken():null;const headers={'Content-Type':'application/json'};if(token)headers.Authorization=`Bearer ${token}`;const res=await fetch('/api/investigation-artifact',{method:'POST',headers,body:JSON.stringify(payload)});const data=await res.json().catch(()=>({}));if(!res.ok)throw new Error(data.error||`Erro HTTP ${res.status}`);if(!data.ready){aiSetThinking(false);const missing=(data.missing||[]);const questions=(data.questions||[]);const plan=Array.isArray(questions)&&questions.length?`\n\nPróximas perguntas:\n${questions.slice(0,4).map((q,i)=>`${i+1}. ${q}`).join('\n')}`:'';const sources=Array.isArray(data.summary?.sourceRefs)&&data.summary.sourceRefs.length?`\n\nEncontrei ${data.summary.sourceRefs.length} fonte(s) interna(s) potencialmente relevante(s), que serão usadas quando as lacunas forem resolvidas.`:'';aiSetMessage('assistant',`Antes de gerar o ${kind.toUpperCase()}, a CORA revisou a investigação e encontrou lacunas que podem mudar o documento.\n\nAinda falta: ${missing.length?missing.join('; '):'informação suficiente para concluir com segurança'}${plan}${sources}\n\nNão vou inventar esses dados. Podemos completar a investigação e gerar o artefato depois.`);aiScrollChat();return;}aiSetThinking(true,'Gerando documentos, apresentação e diagrama…');Object.values(data.files||{}).forEach(aiDownloadBase64File);aiSetThinking(false);aiSetMessage('assistant',`Pronto. O ${kind.toUpperCase()} foi preparado a partir da investigação atual, das evidências e dos registros internos relevantes. Gerei HTML, Word e PowerPoint sem substituir hipóteses por fatos.`);await auditAI('investigation_artifact',{kind,sourceCount:data.summary?.sourceRefs?.length||0});aiScrollChat();}catch(err){aiSetThinking(false);showSaveToast(err.message||'Falha ao gerar artefato.','error');}
    }
    async function aiGenerateSlidesFromChat(){
      const title=(aiPilot.context||'Investigação CORA').split(/[.!?\n]/)[0].slice(0,120);const facts=aiPilot.lastResult?.facts||[];const hyps=aiPilot.lastResult?.hypotheses||aiPilot.lastResult?.possibleCauses||[];const actions=aiPilot.lastResult?.tests||aiPilot.lastResult?.nextSteps||[];const slides=[{title,body:`Contexto\n${aiPilot.context||'Investigação CORA'}`},{title:'Fatos e evidências',body:(Array.isArray(facts)?facts:['Nenhum fato estruturado ainda.']).slice(0,8).map(x=>'• '+x).join('\n')},{title:'Hipóteses',body:(Array.isArray(hyps)?hyps:['Nenhuma hipótese estruturada ainda.']).slice(0,8).map(x=>'• '+x).join('\n')},{title:'Próximos passos',body:(Array.isArray(actions)?actions:['Definir teste discriminatório.']).slice(0,8).map(x=>'• '+x).join('\n')}];aiSetThinking(true,'Gerando apresentação…');try{const token=auth?.currentUser?await auth.currentUser.getIdToken():null;const headers={'Content-Type':'application/json'};if(token)headers.Authorization=`Bearer ${token}`;const res=await fetch('/api/generate-slides',{method:'POST',headers,body:JSON.stringify({title,slides})});const data=await res.json().catch(()=>({}));if(!res.ok)throw new Error(data.error||'Falha ao gerar slides.');aiDownloadBase64File(data.file);aiSetMessage('assistant','A apresentação PowerPoint foi gerada com base na investigação atual.');await auditAI('slides.generate',{count:slides.length});}catch(err){showSaveToast(err.message||'Falha ao gerar slides.','error');}finally{aiSetThinking(false);}}
    async function aiGenerateImageFromChat(){
      const prompt=aiPilot.context||'Crie uma visualização técnica da investigação atual, limpa, profissional e adequada para relatório industrial.';aiSetThinking(true,'Gerando imagem…');try{const token=auth?.currentUser?await auth.currentUser.getIdToken():null;const headers={'Content-Type':'application/json'};if(token)headers.Authorization=`Bearer ${token}`;const res=await fetch('/api/generate-image',{method:'POST',headers,body:JSON.stringify({prompt,images:aiPilot.images.slice(0,4),aspectRatio:'16:9',imageSize:'2K'})});const data=await res.json().catch(()=>({}));if(!res.ok)throw new Error(data.error||'Falha ao gerar imagem.');const src=`data:${data.mime||'image/png'};base64,${data.data}`;aiSetMessage('assistant',`Imagem gerada pela CORA. <a href="${src}" download="cora-geracao.png">Abrir / salvar imagem</a>`);await auditAI('image.generate',{model:data.model});}catch(err){showSaveToast(err.message||'Falha ao gerar imagem.','error');}finally{aiSetThinking(false);}}

    async function organizeFailureWithCora(){
      const form=document.querySelector('#operationalFailureForm');if(!form)return;
      const messages=Array.isArray(aiPilot.conversation)?aiPilot.conversation.slice(-12):[];
      const recentUser=messages.filter(m=>m.role==='user').at(-1)?.text||form.elements.issue?.value||'';
      const context=messages.map(m=>`${m.role==='user'?'Usuário':'CORA'}: ${m.text||''}`).join('\n').slice(-18000);
      const files=[...(document.querySelector('#operationalEvidenceInput')?.files||[])];
      const imageFiles=await readAttachments(files.filter(f=>f.type?.startsWith('image/')));const coraImages=(aiPilot.images||[]).slice(-6).map(x=>({name:x.name,type:x.type,data:x.dataUrl}));
      const token=auth?.currentUser?await auth.currentUser.getIdToken():null;const headers={'Content-Type':'application/json'};if(token)headers.Authorization=`Bearer ${token}`;
      const button=document.querySelector('#organizeFailureWithCora');if(button){button.disabled=true;button.textContent='Organizando…';}
      try{
        const res=await fetch('/api/failure-intake',{method:'POST',headers,body:JSON.stringify({text:recentUser,conversation:context,images:[...imageFiles,...coraImages]})});
        const data=await res.json().catch(()=>({}));if(!res.ok)throw new Error(data.error||`Erro HTTP ${res.status}`);
        const f=form.elements;const set=(name,val)=>{if(f[name]&&val!=null&&String(val).trim())f[name].value=String(val);};
        set('issue',data.issue);set('description_context',data.contextSummary);set('component',data.component);set('material',data.material);set('maquina',data.machine);set('linha',data.line);set('estacao',data.station);set('processo',data.process);set('onde_detectado',data.detectedAt);set('detection_moment',data.detectionMoment);set('quando_inicio',data.startDate);set('quantidade_afetada',data.quantity);set('hipotese_causa',data.hypothesis);set('testes_realizados',data.tests);set('acao_corretiva',data.correctiveAction);set('observacoes',data.notes);set('category_label',data.defectType);
        if(data.family){fillOperationalProducts();f.family.value=data.family;}if(data.product){document.querySelector('#operationalProductSelect').value=data.product;}if(data.classification)f.classification.value=data.classification;if(data.confidence)f.classification_confidence.value=data.confidence;
        showSaveToast('A CORA organizou os dados disponíveis. Revise antes de salvar.','success');
      }catch(err){showSaveToast(err.message||'Não foi possível organizar com a CORA. Preencha manualmente.','error');}
      finally{if(button){button.disabled=false;button.textContent='Organizar com a CORA';}}
    }
    function openFailureFromCoraContext(){const user=Array.isArray(aiPilot.conversation)?aiPilot.conversation.filter(m=>m.role==='user').at(-1):null;const text=user?.text||aiPilot.context||'';openOperationalFailureModal({text});setTimeout(()=>{if(text||aiPilot.images?.length)organizeFailureWithCora();},120);}

    function initAI(){
      document.querySelectorAll('[data-ai-mode]').forEach(b=>b.addEventListener('click',()=>{aiPilot.mode=b.dataset.aiMode;renderAIAnalysis();}));
      document.querySelectorAll('[data-ai-perspective]').forEach(b=>b.addEventListener('click',()=>{aiPilot.perspective=b.dataset.aiPerspective;renderAIAnalysis();}));
            document.querySelector('#aiUseCentral')?.addEventListener('click',aiUseCentral);
      document.querySelector('#aiClearData')?.addEventListener('click',()=>{aiPilot.rows=[];aiPilot.columns=[];aiPilot.source='manual';renderAIAnalysis();});
      document.querySelector('#aiContext')?.addEventListener('input',e=>{aiPilot.context=e.target.value;});
      document.querySelector('#aiRunAnalysis')?.addEventListener('click',aiRun);
      document.querySelector('#aiCreateFailureFromContext')?.addEventListener('click',openFailureFromCoraContext);
      document.querySelector('#organizeFailureWithCora')?.addEventListener('click',organizeFailureWithCora);
      document.querySelector('#aiSaveInvestigation')?.addEventListener('click',aiSave);
      document.addEventListener('click',e=>{const x=e.target.closest('[data-ai-history]');if(x)aiLoadHistory(x.dataset.aiHistory);});
    }
    initAI();

    // ======================= V14.1 — IA multimodal =======================
    aiPilot.images = [];
    aiPilot.dataFiles = [];
    aiPilot.webResearch = 'auto';
    aiPilot.provider = localStorage.getItem('centralAI.provider') || 'auto';
    const savedAIModel = localStorage.getItem('centralAI.model') || '';
    aiPilot.model = savedAIModel === 'gemini-2.5-flash' ? 'gemini-3.8-flash' : (savedAIModel || 'auto');
    aiPilot.endpoint = '/api/failure-analysis';
    aiPilot.uiAgent = false;
    aiPilot.uiSessionId = null;
    aiPilot.depth = 'investigativa';
    // ======================= V14.2 — memória e raciocínio =======================
    const AI_KNOWLEDGE_PROFILE = {
      role:'Assistente de investigação industrial e qualidade',
      domains:['física','eletricidade','eletrônica','componentes eletrônicos','PCBA','fontes e reguladores','sensores','processos de manufatura','montagem','testes','inspeção','qualidade','estatística','RCA','5 Why','Ishikawa/6M','causa e efeito'],
      reasoning:['separar fatos de hipóteses','diferenciar ponto de detecção de ponto de geração','considerar múltiplas causas','buscar evidências contra a hipótese','identificar dados faltantes','propor testes discriminativos','não afirmar causalidade sem evidência','explicar conceitos técnicos de forma prática','usar histórico validado antes de generalizar']
    };

    const AI_SEED_KNOWLEDGE = [
      {type:'historical_pattern',source:'OLL - Oppo Lessons Learned',text:'Falhas registradas anteriormente incluem causas classificadas como fornecedor/material, montagem/operação, equipamento e combinação de causas; ações frequentemente incluem contenção, reforço de SOP, inspeção e feedback/retreinamento.'},
      {type:'historical_pattern',source:'Bases de reparo exportadas',text:'As exportações de defeitos possuem campos úteis para investigação: lote, modelo, material, linha, operação/estação, descrição do defeito, categoria, tipo de causa, localização, reparo, comentário, fonte e resultado do reparo.'},
      {type:'reasoning_rule',source:'Conhecimento do projeto',text:'Ponto de detecção não deve ser tratado automaticamente como ponto de geração da falha.'},
      {type:'reasoning_rule',source:'Conhecimento do projeto',text:'Hipótese, fato e causa confirmada são estados diferentes e devem permanecer separados.'},
      {type:'reasoning_rule',source:'Conhecimento do projeto',text:'Uma falha pode possuir causa principal e fatores contribuintes; a análise não deve forçar uma única causa.'},
      {type:'reasoning_rule',source:'Conhecimento do projeto',text:'Quando uma hipótese puder ser testada, a IA deve sugerir o teste que melhor diferencie as hipóteses concorrentes.'}
    ];

    function aiRelevantText(x){
      return [x?.issue,x?.problem,x?.title,x?.family,x?.product,x?.code,x?.component,x?.material,x?.machine,x?.station,x?.line,x?.operation,x?.defect,x?.cause,x?.analysis,x?.hypothesis,x?.correctiveAction,x?.notes].filter(Boolean).join(' ');
    }
    function aiScoreText(text,q){
      const terms=String(q||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').split(/\W+/).filter(t=>t.length>2);
      const hay=String(text||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
      return terms.reduce((s,t)=>s+(hay.includes(t)?(t.length>5?3:1):0),0);
    }
    function aiBuildMemoryContext(query){
      const q=String(query||'').trim();
      const pool=[];
      const central=[...(state.reports||[]),...(state.operationalFailures||[]),...(state.failureAnalyses||[])];
      central.forEach(x=>{
        const score=aiScoreText(aiRelevantText(x),q);
        if(score>0) pool.push({score,kind:'central',text:aiRelevantText(x).slice(0,700),id:x.id||x.docId});
      });
      (state.aiKnowledge||[]).forEach(x=>{
        const score=aiScoreText(x.text||'',q)+2;
        if(score>0) pool.push({score,kind:'memory',text:String(x.text||'').slice(0,900),id:x.docId});
      });
      AI_SEED_KNOWLEDGE.forEach(x=>{
        const score=aiScoreText(x.text,q)+1;
        if(score>0) pool.push({score,kind:'base',text:x.text,id:x.source});
      });
      pool.sort((a,b)=>b.score-a.score);
      return pool.slice(0,24);
    }
    function aiIsGreeting(text){
      return /^(oi|ola|olá|opa|e ai|e aí|bom dia|boa tarde|boa noite|hello|hi|hey|tudo bem|tudo certo|como vai|beleza|certo|ok|okay|obrigado|obrigada)[!,. ?]*$/i.test(String(text||'').trim());
    }
    function aiIsCorrection(text){
      return /\b(n[aã]o\s+[eé]\s+assim|est[aá]\s+errad[oa]|isso\s+est[aá]\s+errad[oa]|n[aã]o\s+[eé]|incorreto|voc[eê]\s+est[aá]\s+errad[oa])\b/i.test(String(text||''));
    }
    function aiNeedsAnalysis(text,hasData,hasImages){
      if(hasData||hasImages)return true;
      const s=String(text||'').toLowerCase();
      return /(analisa|analis(e|ar)|investig|causa|defeito|falha|problema|hip[oó]tese|rca|5 why|ishikawa|6m|padr[aã]o|tend[eê]ncia|por que|porque|como resolver|o que pode|sensor|eletr|processo|fornecedor|lote|m[aá]quina|operador|turno)/i.test(s);
    }
    function aiNaturalReply(text){
      const t=String(text||'').trim();
      if(/^bom dia/i.test(t))return 'Bom dia! Pode mandar. Estou pronto para pensar com você.';
      if(/^boa tarde/i.test(t))return 'Boa tarde! Pode mandar a situação que vamos investigar juntos.';
      if(/^boa noite/i.test(t))return 'Boa noite! Pode mandar a situação. Vamos organizar o raciocínio juntos.';
      if(/^(tudo bem|tudo certo|como você está|como vc está|como vai|beleza|certo|ok|okay)$/i.test(t))return 'Tudo bem por aqui. Pode mandar a situação que você quer analisar.';
      return 'Oi! Pode mandar a informação do jeito que estiver. Posso ajudar a pensar, analisar dados, interpretar uma foto ou investigar uma falha.';
    }
    async function aiCurrentRole(){
      return String(currentAccount?.role||'user').toLowerCase();
    }
    function aiCanValidateMemory(){
      return ['admin','quality','engineer','specialist','especialista','engenheiro'].includes(String(currentAccount?.role||'').toLowerCase());
    }
    async function aiPostJSON(url, payload){
      const token=auth?.currentUser?await auth.currentUser.getIdToken():null;
      const headers={'Content-Type':'application/json'}; if(token)headers.Authorization=`Bearer ${token}`;
      const res=await fetch(url,{method:'POST',headers,body:JSON.stringify(payload)});
      const data=await res.json().catch(()=>({}));
      if(!res.ok)throw new Error(data?.error||`HTTP ${res.status}`);
      return data;
    }
    async function aiSaveCorrection(userText,previousAssistant){
      const payload={
        type:'user_correction',
        source:'correção do usuário',
        text:userText,
        relatedResponse:String(previousAssistant||'').slice(0,1800),
        clientRole:await aiCurrentRole(),
        requestedStatus:aiCanValidateMemory()?'validada':'pendente_validacao'
      };
      try{
        const result=await aiPostJSON('/api/ai-memory',payload);
        if(result.saved){
          showSaveToast(result.validated?'Correção validada e registrada na memória.':'Correção registrada como pendência de validação.','success');
          return true;
        }
      }catch(err){console.warn('Memória via backend indisponível; usando gravação do cliente com status governado:',err.message);}
      try{
        const item={...payload,status:'pendente_validacao',createdAt:now(),createdBy:currentAccount?.name||'Usuário atual',validatedBy:null,validatedAt:null};
        await addDoc(collection(db,'aiKnowledge'),item);
        showSaveToast(aiCanValidateMemory()?'Correção validada e registrada.':'Correção enviada para validação de especialista.','success');
        return true;
      }catch(err){console.error(err);showSaveToast('Não foi possível registrar a correção: '+err.message,'error');return false;}
    }
    async function aiPromoteKnowledge(docId){
      if(!aiCanValidateMemory())return showSaveToast('Seu perfil não pode validar conhecimento.', 'error');
      try{
        await aiPostJSON(`/api/ai-memory/${encodeURIComponent(docId)}/promote`,{clientRole:currentAccount?.role||'user'});
        showSaveToast('Conhecimento promovido para validado.','success');
      }catch(err){console.error(err);showSaveToast('Não foi possível validar: '+err.message,'error');}
    }

    const AI_LOCAL_HISTORY_KEY='centralAI.conversations.local.v2';
    function aiReadLocalConversations(){
      try{const xs=JSON.parse(localStorage.getItem(AI_LOCAL_HISTORY_KEY)||'[]'); return Array.isArray(xs)?xs:[];}catch{return []}
    }
    function aiWriteLocalConversations(items){
      try{localStorage.setItem(AI_LOCAL_HISTORY_KEY,JSON.stringify(items.slice(0,60)));}catch{}
    }
    function aiMergeConversationLists(){
      const remote=Array.isArray(state.aiConversations)?state.aiConversations:[];
      const local=aiReadLocalConversations();
      const byId=new Map();
      [...remote,...local].forEach(x=>{const key=x.docId||x.localId||x.id;if(!key)return; const prev=byId.get(key); if(!prev || String(x.updatedAt||'')>String(prev.updatedAt||'')) byId.set(key,x);});
      return [...byId.values()];
    }
    async function aiSaveConversation(){
      if(!aiPilot.conversation?.length)return;
      const firstUser=aiPilot.conversation.find(x=>x.role==='user');
      const title=(firstUser?.text||'Nova conversa').slice(0,120);
      const existing=(aiMergeConversationLists()).find(x=>(x.docId||x.localId)===aiPilot.conversationId);
      const localId=existing?.localId||aiPilot.conversationId||`local-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
      const payload={title,messages:aiPilot.conversation.slice(-40),updatedAt:now(),updatedBy:currentAccount?.name||'Usuário atual',pinned:Boolean(existing?.pinned),localId};
      const localItems=aiReadLocalConversations();
      const idx=localItems.findIndex(x=>x.localId===localId || x.docId===localId);
      const localRecord={...payload,localId,createdAt:existing?.createdAt||now()};
      if(idx>=0)localItems[idx]=localRecord;else localItems.unshift(localRecord);
      aiWriteLocalConversations(localItems);
      if(!aiPilot.conversationId)aiPilot.conversationId=localId;
      renderAIHistory();
      try{
        if(aiPilot.conversationId && String(aiPilot.conversationId).startsWith('local-')){
          const ref=await addDoc(collection(db,'aiConversations'),{...payload,createdAt:localRecord.createdAt});
          aiPilot.conversationId=ref.id;
          const next=aiReadLocalConversations().map(x=>x.localId===localId?{...x,docId:ref.id}:x);
          aiWriteLocalConversations(next);
        }else if(aiPilot.conversationId){
          await updateDoc(doc(db,'aiConversations',aiPilot.conversationId),{...payload,createdAt:existing?.createdAt||localRecord.createdAt});
        }
        auditAI('conversation_saved',{conversationId:aiPilot.conversationId,title});
      }catch(err){console.warn('Conversa salva localmente; sincronização Firebase pendente:',err);}
      renderAIHistory();
    }
    function renderAIMemoryPanel(){
      const box=document.querySelector('#aiMemoryPanel');if(!box)return;
      const items=[...(state.aiKnowledge||[])].sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||''))).slice(0,30);
      const base=`<div class="ai-memory-card"><strong>Memória governada</strong><p>Correções e conhecimentos novos entram como evidência/pedência. Apenas perfis autorizados podem promover para 🟢 validado. Conhecimento externo não vira memória automaticamente.</p></div>`;
      if(!items.length){box.innerHTML=base+`<div class="ai-memory-card"><strong>Nenhum conhecimento registrado ainda.</strong><p>Quando você corrigir ou registrar uma informação importante, ela aparecerá aqui.</p></div>`;return;}
      box.innerHTML=base+items.map(x=>{
        const status=/validad/i.test(String(x.status||''))?'🟢 Validado':'🟡 Pendente de validação';
        const action=(!/validad/i.test(String(x.status||''))&&aiCanValidateMemory())?`<button type="button" class="button secondary button-compact" data-ai-promote-memory="${aiEsc(x.docId||'')}">Validar</button>`:'';
        return `<div class="ai-memory-card"><div style="display:flex;align-items:center;justify-content:space-between;gap:8px"><strong>${status}</strong>${action}</div><p>${aiEsc(x.text||'')}</p><small>${aiEsc(x.source||'usuário')} · ${aiEsc(x.createdBy||'')}</small></div>`;
      }).join('');
    }

    function renderAISidebarHistory(){
      const side=document.querySelector('.ai-side-panel');
      if(!side)return;
      let box=document.querySelector('#aiSidebarHistory');
      if(!box){
        box=document.createElement('div');
        box.id='aiSidebarHistory';
        box.className='ai-sidebar-history';
        const spacer=side.querySelector('.ai-side-spacer');
        if(spacer) side.insertBefore(box,spacer); else side.appendChild(box);
      }
      const xs=aiMergeConversationLists().sort((a,b)=>Number(Boolean(b.pinned))-Number(Boolean(a.pinned)) || String(b.updatedAt||'').localeCompare(String(a.updatedAt||''))).slice(0,6);
      if(!xs.length){box.innerHTML='';return;}
      const pinned=xs.filter(x=>x.pinned);
      const recent=xs.filter(x=>!x.pinned);
      const renderSideItem=x=>{
        const key=x.docId||x.localId||'';
        const title=aiEsc(x.title||'Conversa');
        return `<div class="ai-sidebar-history-item" data-ai-open-conversation="${aiEsc(key)}">
          <button type="button" class="ai-history-pin-icon ${x.pinned?'active':''}" data-ai-pin-conversation="${aiEsc(key)}" aria-label="${x.pinned?'Desafixar conversa':'Fixar conversa'}" title="${x.pinned?'Desafixar':'Fixar'}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 4h8l-2 5 3 3v2H7v-2l3-3-2-5Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M12 14v6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg></button>
          <button type="button" class="ai-sidebar-history-open" data-ai-open-btn="${aiEsc(key)}">${title}</button>
          <button type="button" class="ai-history-more" data-ai-history-more="${aiEsc(key)}" aria-label="Mais opções" title="Mais opções">⋯</button>
          <div class="ai-history-menu" data-ai-history-menu="${aiEsc(key)}"><button type="button" data-ai-rename-conversation="${aiEsc(key)}">Renomear</button><button type="button" data-ai-share-conversation="${aiEsc(key)}">Compartilhar</button></div>
        </div>`;
      };
      box.innerHTML=`${pinned.length?`<div class="ai-sidebar-history-section"><div class="ai-sidebar-history-title">Conversas fixadas</div>${pinned.map(renderSideItem).join('')}</div>`:''}<div class="ai-sidebar-history-section"><div class="ai-sidebar-history-title">Conversas recentes</div>${recent.length?recent.map(renderSideItem).join(''):'<div class="ai-sidebar-history-empty">Nenhuma conversa recente.</div>'}</div>`;
      box.querySelectorAll('[data-ai-open-btn]').forEach(el=>el.addEventListener('click',e=>{e.stopPropagation();openAIConversation(el.dataset.aiOpenBtn);}));
      box.querySelectorAll('[data-ai-pin-conversation]').forEach(el=>el.addEventListener('click',e=>{e.stopPropagation();toggleAIConversationPin(el.dataset.aiPinConversation);}));
      box.querySelectorAll('[data-ai-history-more]').forEach(el=>el.addEventListener('click',e=>{e.stopPropagation();const menu=box.querySelector(`[data-ai-history-menu=\"${CSS.escape(el.dataset.aiHistoryMore)}\"]`);box.querySelectorAll('.ai-history-menu.open').forEach(m=>m.classList.remove('open'));menu?.classList.toggle('open');}));
      box.querySelectorAll('[data-ai-rename-conversation]').forEach(el=>el.addEventListener('click',async e=>{e.stopPropagation();await renameAIConversation(el.dataset.aiRenameConversation);}));
      box.querySelectorAll('[data-ai-share-conversation]').forEach(el=>el.addEventListener('click',async e=>{e.stopPropagation();await shareAIConversation(el.dataset.aiShareConversation);}));
      document.addEventListener('click',()=>box.querySelectorAll('.ai-history-menu.open').forEach(m=>m.classList.remove('open')),{once:true});
    }
    function renderAIHistory(){
      renderAISidebarHistory();
      const box=document.querySelector('#aiHistoryPanel');if(!box)return;
      const xs=aiMergeConversationLists().sort((a,b)=>Number(Boolean(b.pinned))-Number(Boolean(a.pinned)) || String(b.updatedAt||'').localeCompare(String(a.updatedAt||''))).slice(0,40);
      if(!xs.length){box.innerHTML='<div class="ai-history-card"><strong>Nenhuma conversa salva ainda.</strong><p>As conversas aparecem aqui automaticamente conforme você usa a CORA.</p></div>';return;}
      const renderItem=x=>{const key=x.docId||x.localId||'';const lastUser=(x.messages||[]).filter(m=>m.role==='user').at(-1)?.text||'';return `<div class="ai-history-card" data-ai-open-conversation="${aiEsc(key)}"><div class="ai-history-actions"><button type="button" class="ai-history-pin ${x.pinned?'active':''}" data-ai-pin-conversation="${aiEsc(key)}" title="${x.pinned?'Desafixar conversa':'Fixar conversa'}" aria-label="${x.pinned?'Desafixar conversa':'Fixar conversa'}">${x.pinned?'★':'☆'}</button></div><strong>${x.pinned?'★ ':''}${aiEsc(x.title||'Conversa')}</strong><p>${aiEsc(lastUser.slice(0,180))}</p><div class="ai-history-meta"><span>${formatDate(x.updatedAt||x.createdAt)}</span>${x.messages?.length?`<span class="ai-history-badge">${x.messages.length} mensagens</span>`:''}</div></div>`};
      const pinned=xs.filter(x=>x.pinned); const recent=xs.filter(x=>!x.pinned);
      box.innerHTML=`<div class="ai-history-section"><div class="ai-history-section-title">Fixadas</div>${pinned.length?pinned.map(renderItem).join(''):'<div class="ai-history-card"><strong>Nenhuma conversa fixada.</strong><p>Fixe as investigações que você consulta com frequência.</p></div>'}</div><div class="ai-history-section"><div class="ai-history-section-title">Recentes</div>${recent.length?recent.map(renderItem).join(''):'<div class="ai-history-card"><strong>Sem conversas recentes.</strong></div>'}</div>`;
    }
    async function renameAIConversation(key){
      const item=aiMergeConversationLists().find(x=>(x.docId||x.localId)===key); if(!item)return;
      const next=window.prompt('Novo nome da conversa', item.title||'Conversa');
      if(next===null)return; const title=String(next).trim(); if(!title)return;
      const localItems=aiReadLocalConversations(); const id=item.localId||((String(item.docId||'').startsWith('local-'))?item.docId:null);
      if(id){const i=localItems.findIndex(x=>x.localId===id||x.docId===item.docId); if(i>=0){localItems[i]={...localItems[i],title};aiWriteLocalConversations(localItems);}}
      if(item.docId && !String(item.docId).startsWith('local-')){try{await updateDoc(doc(db,'aiConversations',item.docId),{title,updatedAt:now()});}catch(err){console.warn('Renome da conversa pendente no Firebase:',err);}}
      renderAIHistory(); showSaveToast('Conversa renomeada.','success');
    }
    async function shareAIConversation(key){
      const item=aiMergeConversationLists().find(x=>(x.docId||x.localId)===key); if(!item)return;
      const lines=[item.title||'Conversa',...(item.messages||[]).map(m=>`${m.role==='user'?'Você':'CORA'}: ${m.text||''}`)]; const text=lines.join('\n\n');
      try{if(navigator.share){await navigator.share({title:item.title||'Conversa',text});}else{await navigator.clipboard.writeText(text);showSaveToast('Conversa copiada para a área de transferência.','success');}}catch(err){if(err?.name!=='AbortError'){try{await navigator.clipboard.writeText(text);showSaveToast('Conversa copiada para a área de transferência.','success');}catch(_){showSaveToast('Não foi possível compartilhar a conversa.','error');}}}
    }
    async function toggleAIConversationPin(key){
      const all=aiMergeConversationLists(); const item=all.find(x=>(x.docId||x.localId)===key); if(!item)return;
      const pinned=!item.pinned;
      const localItems=aiReadLocalConversations();
      const id= item.localId || (String(item.docId||'').startsWith('local-')?item.docId:null);
      if(id){const i=localItems.findIndex(x=>x.localId===id||x.docId===item.docId); if(i>=0){localItems[i]={...localItems[i],pinned};aiWriteLocalConversations(localItems);}}
      if(item.docId && !String(item.docId).startsWith('local-')){
        try{await updateDoc(doc(db,'aiConversations',item.docId),{pinned,updatedAt:now()});}catch(err){console.warn('Pin da conversa pendente no Firebase:',err);}
      }
      renderAIHistory();
      showSaveToast(pinned?'Conversa fixada.':'Conversa desafixada.','success');
    }
    async function openAIConversation(key){
      const item=aiMergeConversationLists().find(x=>(x.docId||x.localId)===key); if(!item)return;
      aiPilot.conversationId=item.docId||item.localId||null;
      aiPilot.conversation=Array.isArray(item.messages)?item.messages.map(m=>({role:m.role,text:String(m.text||''),at:m.at||now()})):[];
      const conv=document.querySelector('#aiConversation'); if(conv)conv.innerHTML='';
      aiPilot.conversation.forEach(m=>{const role=m.role==='assistant'?'assistant':'user'; aiSetMessage(role,m.text);});
      const welcome=document.querySelector('#aiWelcome'); if(welcome)welcome.classList.toggle('hidden',aiPilot.conversation.length>0);
      document.querySelectorAll('[data-ai-side]').forEach(x=>x.classList.toggle('active',x.dataset.aiSide==='chat'));
      document.querySelector('#aiConversation')?.classList.remove('hidden'); document.querySelector('#aiHistoryPanel')?.classList.add('hidden'); document.querySelector('#aiMemoryPanel')?.classList.add('hidden');
      aiScrollChat();
    }
    function aiMarkdownToHtml(input){
      const escHtml=v=>String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
      let text=escHtml(input).replace(/\r\n?/g,'\n');
      text=text.replace(/`([^`\n]+)`/g,'<code>$1</code>');
      text=text.replace(/\[([^\]\n]+)\]\((https?:\/\/[^)\s]+)\)/g,'<a href="$2" target="_blank" rel="noopener noreferrer nofollow">$1</a>');
      text=text.replace(/^###\s+(.+)$/gm,'<h4>$1</h4>').replace(/^##\s+(.+)$/gm,'<h3>$1</h3>').replace(/^#\s+(.+)$/gm,'<h2>$1</h2>');
      text=text.replace(/\*\*([^*\n]+)\*\*/g,'<strong>$1</strong>').replace(/__([^_\n]+)__/g,'<strong>$1</strong>');
      text=text.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g,'$1<em>$2</em>').replace(/(^|[^_])_([^_\n]+)_(?!_)/g,'$1<em>$2</em>');
      const lines=text.split('\n'); let out=[]; let inUl=false,inOl=false,inTable=false;
      const flush=()=>{if(inUl){out.push('</ul>');inUl=false;}if(inOl){out.push('</ol>');inOl=false;}if(inTable){out.push('</tbody></table>');inTable=false;}};
      for(let i=0;i<lines.length;i++){
        const line=lines[i];
        const next=lines[i+1]||'';
        const isTable=line.includes('|') && /^\s*\|?.+\|.+\|?\s*$/.test(line);
        const isSep=/^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(next);
        if(isTable && isSep){
          flush();
          const headers=line.split('|').map(x=>x.trim()).filter(Boolean);
          out.push('<table><thead><tr>'+headers.map(h=>`<th>${h}</th>`).join('')+'</tr></thead><tbody>');inTable=true;i++;continue;
        }
        if(inTable && isTable){const cells=line.split('|').map(x=>x.trim()).filter(Boolean);out.push('<tr>'+cells.map(c=>`<td>${c}</td>`).join('')+'</tr>');continue;}
        if(inTable&&!isTable)flush();
        const quote=line.match(/^\s*>\s?(.*)$/);
        if(quote){flush();out.push(`<blockquote>${quote[1]}</blockquote>`);continue;}
        const ul=line.match(/^\s*[-*]\s+(.+)$/); const ol=line.match(/^\s*\d+[.)]\s+(.+)$/);
        if(ul){if(!inUl){flush();out.push('<ul>');inUl=true;}out.push(`<li>${ul[1]}</li>`);continue;}
        if(ol){if(!inOl){flush();out.push('<ol>');inOl=true;}out.push(`<li>${ol[1]}</li>`);continue;}
        flush();
        if(!line.trim()){out.push('');continue;}
        if(/^<h[234]>/.test(line))out.push(line); else out.push(`<p>${line}</p>`);
      }
      flush();
      return out.join('').replace(/<p><\/p>/g,'<div class="ai-md-spacer"></div>');
    }
    function aiCreateAssistantElement(){
      const box=document.querySelector('#aiConversation'); if(!box)return null;
      const el=document.createElement('div'); el.className='ai-message assistant';
      const bubble=document.createElement('div'); bubble.className='ai-message-bubble ai-markdown';
      const feedback=document.createElement('div');feedback.className='ai-message-feedback';
      feedback.innerHTML='<button type="button" class="ai-feedback" data-ai-feedback="correct">Correto</button><button type="button" class="ai-feedback" data-ai-feedback="wrong">Corrigir</button>';
      el.appendChild(bubble);el.appendChild(feedback);box.appendChild(el); return {el,bubble};
    }
    function aiSetLiveStreamStatus(node,status){
      if(!node?.bubble)return;
      let live=node.bubble.querySelector('.ai-live-stream');
      if(!live){
        node.bubble.innerHTML='<div class="ai-live-stream"><div class="ai-live-stream-head"><strong>CORA</strong><span class="ai-live-stream-timer">00:00</span><button type="button" class="ai-live-stream-cancel">Cancelar</button></div><div class="ai-live-stream-status"></div><div class="ai-live-stream-steps"></div></div>';
        live=node.bubble.querySelector('.ai-live-stream');
        node._liveStartedAt=Date.now();
        node._liveTimer=setInterval(()=>{const el=node.bubble.querySelector('.ai-live-stream-timer');if(el){const sec=Math.floor((Date.now()-node._liveStartedAt)/1000);el.textContent=`${String(Math.floor(sec/60)).padStart(2,'0')}:${String(sec%60).padStart(2,'0')}`;}},1000);
        node.bubble.querySelector('.ai-live-stream-cancel')?.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();if(aiActiveAbortController){aiActiveAbortController._userCancelled=true;aiActiveAbortController.abort();}const b=e.currentTarget;b.disabled=true;b.textContent='Cancelando…';});
      }
      const statusEl=live.querySelector('.ai-live-stream-status');if(statusEl)statusEl.textContent=String(status||'Analisando…');
      const steps=live.querySelector('.ai-live-stream-steps');
      const seen=node.dataset.liveSteps?node.dataset.liveSteps.split('\n').filter(Boolean):[];
      const label=String(status||'').trim();
      if(label&&!seen.includes(label)){seen.push(label);node.dataset.liveSteps=seen.join('\n');const row=document.createElement('div');row.className='ai-live-stream-step';row.textContent='✓ '+label;steps?.appendChild(row);}
      aiScrollChat();
    }
    function aiFinishLiveStream(node){if(!node)return;if(node._liveTimer)clearInterval(node._liveTimer);node._liveTimer=null;}
    function aiSetMessage(role,text){
      const box=document.querySelector('#aiConversation'); if(!box)return;
      const el=document.createElement('div'); el.className=`ai-message ${role}`;
      const bubble=document.createElement('div'); bubble.className='ai-message-bubble'+(role==='assistant'?' ai-markdown':'');
      if(role==='assistant') bubble.innerHTML=aiMarkdownToHtml(text); else bubble.textContent=String(text??'');
      el.appendChild(bubble);
      if(role==='assistant'){
        const feedback=document.createElement('div');feedback.className='ai-message-feedback';
        feedback.innerHTML='<button type="button" class="ai-feedback" data-ai-feedback="correct">Correto</button><button type="button" class="ai-feedback" data-ai-feedback="wrong">Corrigir</button>';
        el.appendChild(feedback);
      }
      box.appendChild(el);
      aiPilot.conversation=aiPilot.conversation||[]; aiPilot.conversation.push({role,text:String(text??''),at:now()});
      aiScrollChat();
    }
    function aiRenderSourceMeta(container, result){
      if(!container||!result)return;
      const sources=[];
      if(result.provider) sources.push(result.provider==='openai'?'OpenAI':(result.provider==='gemini'?'Gemini':result.provider));
      if(Number(result.rag?.hits||0)>0) sources.push(`Central: ${result.rag.hits} evidência(s)`);
      if(result.webResearch) sources.push('Web');
      if(result.chain?.verification?.openAIUsed) sources.push('verificação GPT');
      if(!sources.length)return;
      const meta=document.createElement('div');
      meta.className='ai-source-meta';
      meta.textContent='Base consultada: '+sources.join(' · ');
      container.el?.appendChild(meta);
    }

    async function aiCallLLMStream(payload,onDelta,onStatus){
      if((payload.provider||aiPilot.provider)==='gemini') payload.provider='backend';
      const token=auth?.currentUser?await auth.currentUser.getIdToken():null;
      const headers={'Content-Type':'application/json','Accept':'text/event-stream'}; if(token)headers.Authorization=`Bearer ${token}`;
      const controller=new AbortController(); aiActiveAbortController=controller;
      const timeoutMs=Number(payload.chain?52000:28000);
      const timer=setTimeout(()=>controller.abort(),timeoutMs);
      try{
        let res;
        try{
          res=await fetch('/api/failure-analysis/stream',{method:'POST',headers,body:JSON.stringify({...payload,systemPrompt:AI_SYSTEM_PROMPT,prompt:aiBuildPromptText(payload),stream:true}),signal:controller.signal});
        }catch(err){
          if(err?.name==='AbortError'){
            const e=new Error(controller._userCancelled?'Execução cancelada pelo usuário.':'A execução excedeu o tempo limite do cliente.');
            e.userCancelled=Boolean(controller._userCancelled); e.timeout=!e.userCancelled; throw e;
          }
          throw err;
        }
        if(!res.ok){const data=await res.json().catch(()=>null);throw new Error(data?.error||`Servidor de IA retornou HTTP ${res.status}.`);}
        const reader=res.body?.getReader(); if(!reader)throw new Error('O navegador não suporta streaming de resposta.');
        const decoder=new TextDecoder(); let buffer=''; let answer=''; let doneData=null;
        while(true){
          const {value,done}=await reader.read(); if(done)break;
          buffer+=decoder.decode(value,{stream:true}); const blocks=buffer.split(/\n\n/); buffer=blocks.pop()||'';
          for(const block of blocks){
            let ev='message'; let data='';
            for(const line of block.split(/\r?\n/)){if(line.startsWith('event:'))ev=line.slice(6).trim(); else if(line.startsWith('data:'))data+=line.slice(5).trim();}
            if(!data)continue;
            let obj;try{obj=JSON.parse(data);}catch{continue;}
            if(ev==='delta'&&obj.text){answer+=obj.text;onDelta?.(obj.text);}
            else if(ev==='status')onStatus?.(obj.message||obj.stage||'Investigando…');
            else if(ev==='heartbeat')onStatus?.();
            else if(ev==='done')doneData=obj;
            else if(ev==='error'){const err=new Error(obj.error||'Erro no streaming da IA.');err.retryable=obj.retryable;err.timeout=Boolean(obj.timeout);throw err;}
          }
        }
        return {...(doneData||{}),answer:doneData?.answer||answer};
      }finally{
        clearTimeout(timer); if(aiActiveAbortController===controller)aiActiveAbortController=null;
      }
    }

    function aiResetChat(){
      aiPilot.context='';aiPilot.rows=[];aiPilot.columns=[];aiPilot.source='manual';aiPilot.focusedCentralContext=[];aiPilot.lastResult=null;aiPilot.images=[];aiPilot.dataFiles=[];aiPilot.webResearch='auto';aiPilot.conversation=[];aiPilot.conversationId=null;
      const c=document.querySelector('#aiContext');if(c)c.value=''; const conv=document.querySelector('#aiConversation');if(conv)conv.innerHTML='';
      const result=document.querySelector('#aiResult');if(result)result.innerHTML='';
      renderAIAnalysis(); aiRenderAttachments(); aiUpdateAIState();
    }
    function aiRenderAttachments(){
      const box=document.querySelector('#aiAttachmentPreview');if(!box)return;
      const imgs=aiPilot.images.map((im,i)=>`<div class="ai-attachment"><img src="${im.dataUrl}" alt="Evidência ${i+1}"><button type="button" data-ai-remove-image="${i}" aria-label="Remover imagem">×</button></div>`).join('');
      const files=(aiPilot.dataFiles||[]).map((f,i)=>`<div class="ai-attachment file"><strong title="${aiEsc(f.name)}">${aiEsc(f.name)}</strong><span>${f.rows.length} registro(s)</span><button type="button" data-ai-remove-file="${i}" aria-label="Remover arquivo">×</button></div>`).join('');
      box.innerHTML=imgs+files;
      document.querySelector('#aiClearAttachments')?.classList.toggle('hidden',!(aiPilot.images.length||(aiPilot.dataFiles||[]).length));
    }
    function aiUpdateAIState(){
      const rs=document.querySelector('#aiResearchState'); if(rs)rs.textContent='Fontes: seleção automática';
      const ds=document.querySelector('#aiDataState'); 
      const product=activeData();
      const bits=[];
      if(product?.code)bits.push(product.code);
      if(aiPilot.rows.length)bits.push(`${aiPilot.rows.length} anexo(s)`);
      if(aiPilot.images.length)bits.push(`${aiPilot.images.length} imagem(ns)`);
      if(ds)ds.textContent=bits.length?`Contexto automático · ${bits.join(' · ')}`:`Contexto automático da Central`;
      document.querySelector('#aiWebResearch')?.classList.remove('active');
      const summary=document.querySelector('#aiContextSummary');
      if(summary)summary.textContent=product?.code?`Ligado automaticamente ao contexto de ${product.code}; o servidor decide o que é relevante.`:'A IA seleciona automaticamente conversa, Central, memória, imagens e web quando necessário.';
    }
    async function aiReadImages(files){
      const arr=[...files].filter(f=>f.type.startsWith('image/')).slice(0,6);
      let i=0;
      for(const file of arr){
        const packed=await readAttachments([file]);
        const item=packed[0];
        if(!item?.data) throw new Error(`Não foi possível preparar ${file.name}.`);
        aiPilot.images.push({name:item.name,type:item.type||'image/jpeg',dataUrl:item.data});
        aiSetUploadProgress(Math.round((++i/Math.max(1,arr.length))*100),`Imagem ${i}/${arr.length}`);
      }
      aiRenderAttachments(); aiSetUploadProgress(100,'Imagens prontas');aiUpdateAIState();aiScrollChat();
    }

    function aiParseCsv(text){
      const lines=text.split(/\r?\n/).filter(Boolean);if(!lines.length)return {rows:[],columns:[]};
      const sep=(lines[0].match(/;/g)||[]).length>(lines[0].match(/,/g)||[]).length?';':',';
      const parseLine=line=>{let out=[],cur='',q=false;for(let i=0;i<line.length;i++){const ch=line[i];if(ch==='"'){if(q&&line[i+1]==='"'){cur+='"';i++;}else q=!q;}else if(ch===sep&&!q){out.push(cur.trim());cur='';}else cur+=ch;}out.push(cur.trim());return out;};
      const columns=parseLine(lines[0]);
      const rows=lines.slice(1).map(line=>{const vals=parseLine(line);const o={};columns.forEach((h,i)=>o[h||`Campo ${i+1}`]=vals[i]??'');return o;});
      return {rows,columns};
    }
    async function aiParseDataFile(file){
      const name=file.name.toLowerCase();
      if(name.endsWith('.csv')) return aiParseCsv(await file.text());
      if(!window.XLSX)throw new Error('Leitor de Excel não carregado. Verifique sua conexão e tente novamente.');
      const data=await file.arrayBuffer();const wb=window.XLSX.read(data,{type:'array'});const ws=wb.Sheets[wb.SheetNames[0]];const rows=window.XLSX.utils.sheet_to_json(ws,{defval:''});
      return {rows,columns:rows.length?Object.keys(rows[0]):[]};
    }
    function aiRebuildDataFiles(){
      const allRows=[],colSet=new Set();
      (aiPilot.dataFiles||[]).forEach(f=>{f.rows.forEach(r=>allRows.push(r));f.columns.forEach(c=>colSet.add(c));});
      aiPilot.rows=allRows;aiPilot.columns=[...colSet];
      if(aiPilot.dataFiles.length)aiPilot.source=aiPilot.dataFiles.map(f=>f.name).join(', ');
      else if(!aiPilot.images.length)aiPilot.source='manual';
      aiPilot.sourceKnowledge=aiPilot.dataFiles.length?{files:aiPilot.dataFiles.map(f=>({name:f.name,records:f.rows.length,columns:f.columns.slice(0,40)})),records:allRows.length,columns:aiPilot.columns.slice(0,40)}:null;
    }
    async function aiReadFiles(files){
      const arr=[...files].slice(0,8); aiSetUploadProgress(1,`Lendo ${arr.length} arquivo(s)…`); let i=0;
      for(const file of arr){
        const parsed=await aiParseDataFile(file);aiPilot.dataFiles.push({name:file.name,type:file.type,rows:parsed.rows,columns:parsed.columns}); aiSetUploadProgress(Math.round((++i/Math.max(1,arr.length))*100),`Arquivo ${i}/${arr.length}`);
      }
      aiRebuildDataFiles(); aiSetUploadProgress(100,'Dados prontos');aiRenderAttachments();renderAIAnalysis();aiUpdateAIState();aiScrollChat();
    }
    function aiBuildDynamicCentralContext(){
      const normalizeReport=r=>({tipo:'Report',id:r.id||r.docId||'',produto:r.product||r.produto||'',familia:r.family||r.familia||'',defeito:r.issue||r.defect||r.defeito||'',componente:r.component||r.componente||'',material:r.material||'',responsavel:r.owner||'',quantidade:r.quantity||1,data:r.createdAt||r.date||'',status:r.status||'',hipotese:r.analysis?.hypothesis||r.hypothesis||'',causa:r.analysis?.cause||r.cause||''});
      const normalizeOp=r=>({tipo:r.occurrenceMode||'Operacional',id:r.id||r.docId||'',produto:r.product||r.produto||'',familia:r.family||r.familia||'',defeito:r.issue||r.defect||r.defeito||'',maquina:r.machine||'',linha:r.line||'',estacao:r.station||'',operacao:r.operation||'',turno:r.shift||'',componente:r.damagedPart||r.component||'',quantidade:r.quantity||1,data:r.createdAt||r.date||'',status:r.status||'',hipotese:r.hypothesis||'',causa:r.cause||''});
      const currentReport=selectedId?state.reports.find(r=>(r.id||r.docId)===selectedId):null;
      const currentOp=selectedOperationalId?state.operationalFailures.find(r=>(r.id||r.docId)===selectedOperationalId):null;
      const product=activeData();
      const compactReports=(state.reports||[]).slice(0,400).map(normalizeReport);
      const compactOps=(state.operationalFailures||[]).slice(0,300).map(normalizeOp);
      const compactAnalyses=(state.failureAnalyses||[]).slice(0,200).map(r=>({tipo:'Análise anterior',id:r.id||r.docId||'',titulo:r.title||'',problema:r.problem||'',perspectiva:r.perspective||'',status:r.status||'',resultado:r.result||{}}));
      const compactProducts=(state.products||[]).slice(0,300).map(r=>({id:r.id||r.docId||'',code:r.code||'',name:r.name||'',family:r.family||'',model:r.model||''}));
      const compactKnowledge=(state.aiKnowledge||[]).filter(r=>/validad/i.test(String(r.status||''))).slice(0,200).map(r=>({id:r.id||r.docId||'',text:r.text||'',status:r.status||'',type:r.type||''}));
      return {
        activeView,
        activeProduct:product?{code:product.code||'',name:product.name||'',family:product.family||''}:null,
        currentReport:currentReport?normalizeReport(currentReport):null,
        currentOperationalFailure:currentOp?normalizeOp(currentOp):null,
        focusedContext:Array.isArray(aiPilot.focusedCentralContext)?aiPilot.focusedCentralContext.slice(0,12):[],
        reports:compactReports,
        operationalFailures:compactOps,
        failureAnalyses:compactAnalyses,
        products:compactProducts,
        aiKnowledge:compactKnowledge,
        counts:{
          reports:(state.reports||[]).length,
          operationalFailures:(state.operationalFailures||[]).length,
          failureAnalyses:(state.failureAnalyses||[]).length,
          products:(state.products||[]).length,
          knowledgeItems:(state.aiKnowledge||[]).length
        },
        note:'Em desenvolvimento, este snapshot compacto permite ao backend pesquisar a base disponível no navegador. Em produção, o backend deve preferir as fontes completas do Firebase.'
      };
    }

    const AI_SYSTEM_PROMPT=`Você é o Investigador Cognitivo da Central de Trabalho, especialista em qualidade industrial, RCA e diagnóstico técnico.

PRINCÍPIO CENTRAL:
Você tem acesso amplo a conversa, memória, dados da Central, imagens/documentos e pesquisa externa. Isso NÃO significa usar tudo em toda resposta. Primeiro compreenda a pergunta; depois decida quais fontes são realmente necessárias e ignore o restante.

RELEVÂNCIA:
- Não confunda semelhança textual com relevância.
- Avalie produto, componente, material, modo de falha, mecanismo, processo, estação, lote, turno, fornecedor e contexto.
- Um registro de outro produto pode ser relevante quando compartilha o mesmo mecanismo/componente/modo de falha.
- Um registro do mesmo produto pode ser irrelevante se tratar de outro mecanismo.
- Para cada registro usado, identifique exatamente qual fato ele sustenta. Nunca herde o restante do registro.

CONHECIMENTO:
🟢 Validado = informação aprovada na memória da Central.
🟡 Evidência = dado ou observação ainda em análise.
🔵 Externo = informação obtida fora da Central.
🟠 Hipótese = possibilidade ainda não confirmada.
🔴 Conflito = fontes divergentes; gere pergunta discriminatória.

CONDUTA:
- Separe fato, evidência, hipótese e causa confirmada.
- Diferencie ponto de detecção e ponto de geração.
- Use múltiplos fatores quando os dados sustentarem.
- Se faltar uma evidência crítica, faça UMA pergunta objetiva por vez.
- Não repita perguntas já respondidas.
- Não crie relatórios longos sem pedido.
- Pesquise externamente quando conhecimento técnico atual/generalista estiver faltando ou quando a pergunta pedir comparação/validação.
- Compare fontes quando a comparação puder mudar a conclusão.
- Em imagens, descreva apenas o que é observável e separe observação de inferência.
- Nunca invente dados, medições ou históricos.
- Não exponha Chain of Thought. Mostre somente resultados, evidências, incertezas e próximos passos.
- Se nenhuma evidência interna relevante for encontrada, diga isso claramente antes de usar conhecimento externo.
- Quando houver conflito entre evidências, não escolha por preferência: faça a pergunta mais discriminatória possível.
- Quando puder responder bem, responda sem pedir informação desnecessária.
`;

    function aiBuildPromptText(payload){
      const memoryText=(payload.memory||[]).slice(0,12).map(x=>typeof x==='string'?x:x.text||JSON.stringify(x)).join('\n- ');
      const rowsText=(payload.rows||[]).slice(0,250).map(r=>JSON.stringify(r)).join('\n');
      const central=payload.centralData||{};
      return `${AI_SYSTEM_PROMPT}

CONTEXTO DA CONVERSA:
${payload.context||'(sem texto; há anexos/dados)'}

HISTÓRICO RECENTE:
${(payload.conversation||[]).slice(-16).map(x=>`${x.role}: ${x.text}`).join('\n')}

MEMÓRIA RELEVANTE:
- ${memoryText||'(nenhuma)'}

ESTADO AUTOMÁTICO DA CENTRAL:
${JSON.stringify(central).slice(0,18000)}

REGRAS DE ORQUESTRAÇÃO:
- O servidor consulta as bases completas e seleciona evidências relevantes.
- Não trate a lista de fontes disponíveis como instrução para usá-las todas.
- Você pode pedir mais dados via ferramentas internas quando necessário.
- Quando uma pesquisa interna não encontrar nada relevante, declare essa ausência antes de recorrer à web.

DADOS ANEXADOS DIRETAMENTE:
${rowsText.slice(0,50000)}`;
    }

    function aiPageState(){
      const isVisible=el=>{const r=el.getBoundingClientRect();const st=getComputedStyle(el);return r.width>0&&r.height>0&&st.display!=='none'&&st.visibility!=='hidden';};
      const nodes=[...document.querySelectorAll('button,input,textarea,select,a,[role="button"],[data-ia-id]')];
      let i=0;
      const interactive=nodes.map(el=>{
        if(!el.dataset.iaId)el.dataset.iaId=el.id||`ia-el-${++i}`;
        const type=String(el.type||el.tagName||'').toLowerCase();
        if(type==='password'||type==='file')return null;
        if(el.closest('.ai-composer,.ai-provider-box'))return null;
        if(!isVisible(el))return null;
        const label=el.getAttribute('aria-label')||el.getAttribute('title')||'';
        const text=(el.innerText||el.textContent||el.placeholder||label||'').trim().replace(/\s+/g,' ').slice(0,180);
        const value=(el.tagName==='INPUT'||el.tagName==='TEXTAREA'||el.tagName==='SELECT')&&type!=='password'?String(el.value||'').slice(0,180):'';
        return {id:el.dataset.iaId,tag:el.tagName.toLowerCase(),text,value,type:el.type||null,disabled:!!el.disabled,checked:'checked' in el?!!el.checked:undefined,visible:true};
      }).filter(Boolean).slice(0,180);
      return {title:document.title,url:location.pathname,elementosInterativos:interactive};
    }
    async function aiExecutePageAction(cmd){
      const target=document.querySelector(`[data-ia-id="${CSS.escape(String(cmd.targetId||''))}"]`)||document.getElementById(String(cmd.targetId||''));
      if(!target)return {sucesso:false,erro:'Elemento não encontrado no DOM atual.',novoEstado:aiPageState()};
      const before=aiPageState();
      target.scrollIntoView({behavior:'smooth',block:'center'});target.style.outline='3px solid #111';
      await new Promise(r=>setTimeout(r,180));
      try{
        const action=cmd.action;
        if(action==='click'){if(target.disabled)return {sucesso:false,erro:'Elemento desabilitado.',antes:before,novoEstado:aiPageState()};target.click();}
        else if(action==='fill'){target.focus();target.value=String(cmd.value??'');target.dispatchEvent(new Event('input',{bubbles:true}));target.dispatchEvent(new Event('change',{bubbles:true}));}
        else if(action==='select'){if(target.tagName!=='SELECT')return {sucesso:false,erro:'Elemento alvo não é um select.',antes:before,novoEstado:aiPageState()};target.value=String(cmd.value??'');target.dispatchEvent(new Event('change',{bubbles:true}));}
        else if(action==='scroll'){target.scrollIntoView({behavior:'smooth',block:'center'});}
        else return {sucesso:false,erro:`Ação não suportada: ${action}`};
        await new Promise(r=>setTimeout(r,350));
        return {sucesso:true,acao:action,targetId:String(cmd.targetId),novoEstado:aiPageState()};
      }catch(err){return {sucesso:false,erro:err?.message||String(err),novoEstado:aiPageState()};}
      finally{target.style.outline='';}
    }
    async function aiRunUIAgent(userText){
      aiSetThinking(true,'Entendendo o objetivo e observando a tela…');
      let sessionId=aiPilot.uiSessionId; let message=String(userText||'');
      for(let step=0;step<6;step++){
        const token=auth?.currentUser?await auth.currentUser.getIdToken():null;
        const headers={'Content-Type':'application/json'};if(token)headers.Authorization=`Bearer ${token}`;
        const payload=sessionId?{sessionId,observation:{name:aiPilot.uiLastToolName||'interact_with_page',callId:aiPilot.uiLastCallId||'',result:aiPilot.uiLastObservation||{}},pageState:aiPageState()}:{message,pageState:aiPageState(),model:aiPilot.model};
        const res=await fetch('/api/chat-cognitive',{method:'POST',headers,body:JSON.stringify(payload)});
        const data=await res.json().catch(()=>({}));
        if(!res.ok)throw new Error(data.error||`Agente de interface HTTP ${res.status}`);
        sessionId=data.sessionId;aiPilot.uiSessionId=sessionId;
        if(data.type==='REQUISITAR_ACAO_UI'){
          aiPilot.uiLastToolName=data.chamadaFerramenta?.name||'interact_with_page';aiPilot.uiLastCallId=data.chamadaFerramenta?.id||data.chamadaFerramenta?.call_id||'';
          aiSetThinking(true, data.chamadaFerramenta?.args?.reason || 'Executando a próxima ação…');
          aiPilot.uiLastObservation=await aiExecutePageAction(data.chamadaFerramenta?.args||{});await auditAI('ui_tool',{name:aiPilot.uiLastToolName,args:data.chamadaFerramenta?.args||{},result:aiPilot.uiLastObservation?.sucesso!==false});
          continue;
        }
        const answer=data.respostaTexto||'Concluído.';aiSetMessage('assistant',answer);aiSetThinking(false);aiPilot.lastResult=data;aiPilot.uiSessionId=null;return;
      }
      aiPilot.uiSessionId=null;throw new Error('O agente atingiu o limite de ações para esta solicitação.');
    }
    function aiBuildPayload(){
      const memory=aiBuildMemoryContext(aiPilot.context);
      const centralData=aiBuildDynamicCentralContext();
      return {
        mode:aiPilot.mode,
        perspective:aiPilot.perspective,
        depth:aiPilot.depth,
        context:aiPilot.context,
        rows:aiPilot.rows,
        tasks:aiTasks(),
        webResearch:'auto',
        enableTools:true,
        images:aiPilot.images.map(x=>({name:x.name,type:x.type,dataUrl:x.dataUrl})),
        knowledgeProfile:AI_KNOWLEDGE_PROFILE,
        memory,
        conversation:(aiPilot.conversation||[]).slice(-20),
        sourceKnowledge:aiPilot.sourceKnowledge||null,
        centralContext:centralData.counts,
        centralData,
        focusedCentralContext:Array.isArray(aiPilot.focusedCentralContext)?aiPilot.focusedCentralContext.slice(0,12):[],
        provider:aiPilot.provider||'auto',
        model:aiPilot.model&&aiPilot.model!=='auto'?aiPilot.model:undefined,
        endpoint:aiPilot.endpoint,
        uiAgent:!!document.querySelector('#aiUIAgent')?.checked,
        instructions:{
          behaveConversationally:true,
          answerGreetingsNormally:true,
          adaptiveSources:true,
          broadInternalSearch:true,
          useWebWhenNeeded:true,
          relevanceGate:true,
          doNotImportSimilarCases:true,
          compareMechanisms:true,
          zeroMappingNotice:true,
          dualModelVerification:true,
          memoryGovernance:true,
          factsOnly:true,
          separateHypothesisFromConfirmedCause:true,
          askMissingData:true,
          askOnlyOneQuestionAtATime:true,
          suggestTests:true,
          compareHistory:true,
          analyzeImages:true,
          explainVisualEvidence:true,
          useAgentChainForInvestigations:true,
          returnOnlyChatAnswer:true
        }
      };
    }
    function aiScrollChat(){
      const sc=document.querySelector('#aiChatScroll');
      if(sc)requestAnimationFrame(()=>{sc.scrollTop=sc.scrollHeight;});
    }
    function aiSetThinking(show=true,label='Analisando com a IA…'){
      const box=document.querySelector('#aiConversation');if(!box)return;
      let el=document.querySelector('#aiThinkingIndicator');
      if(show){
        if(!el){
          el=document.createElement('details');el.id='aiThinkingIndicator';el.className='ai-work-status';el.open=true;
          el.innerHTML=`<summary><span class="ai-work-dot" aria-hidden="true"></span><span class="ai-work-current"></span><span class="ai-work-timer">00:00</span><button type="button" class="ai-work-cancel" title="Cancelar execução">Cancelar</button></summary><div class="ai-work-steps" aria-live="polite"></div>`;
          const slot=document.querySelector('#aiWorkStatusSlot');(slot||box).appendChild(el);el.dataset.steps='';el.dataset.startedAt=String(Date.now());
          const timerEl=el.querySelector('.ai-work-timer');el._timer=setInterval(()=>{const sec=Math.floor((Date.now()-Number(el.dataset.startedAt||Date.now()))/1000);if(timerEl)timerEl.textContent=`${String(Math.floor(sec/60)).padStart(2,'0')}:${String(sec%60).padStart(2,'0')}`;},1000);
          el.querySelector('.ai-work-cancel')?.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();if(aiActiveAbortController){aiActiveAbortController._userCancelled=true;aiActiveAbortController.abort();}const current=el.querySelector('.ai-work-current');if(current)current.textContent='Cancelando execução…';});
        }
        const current=el.querySelector('.ai-work-current');if(current&&label)current.textContent=label;
        const steps=el.querySelector('.ai-work-steps');if(steps&&label){const seen=(el.dataset.steps||'').split('\n').filter(Boolean);if(!seen.includes(label)){seen.push(label);el.dataset.steps=seen.join('\n');const row=document.createElement('div');row.className='ai-work-step';row.textContent=label;steps.appendChild(row);}}
        aiScrollChat();
      }else if(el){if(el._timer)clearInterval(el._timer);el.remove();}
    }

    function aiLoadProviderConfig(){
      const ui=document.querySelector('#aiUIAgent');if(ui)ui.checked=!!aiPilot.uiAgent;
      const provider=document.querySelector('#aiProviderSelect');const model=document.querySelector('#aiModelInput');
      if(provider)provider.value=aiPilot.provider||'auto';if(model)model.value=aiPilot.model||'auto';
      aiUpdateProviderUI();
    }
    function aiUpdateProviderUI(){
      const provider=document.querySelector('#aiProviderSelect');
      const model=document.querySelector('#aiModelInput');
      if(!provider||!model)return;
      if(provider.value==='auto'){
        model.placeholder='automático — Gemini 3.8 Flash + GPT-6 Astra';
        if(!model.value||/claude|gpt-|gemini-/.test(model.value))model.value='auto';
      }else if(provider.value==='backend'){
        model.placeholder='gemini-3.8-flash';
        if(!model.value||/claude|gpt-|^auto$/i.test(model.value))model.value='gemini-3.8-flash';
      }else if(provider.value==='openai'){
        model.placeholder='gpt-6-astra';
        if(!model.value||/gemini|claude|^auto$/i.test(model.value))model.value='gpt-6-astra';
      }else if(provider.value==='anthropic'){
        model.placeholder='claude-sonnet-4-5';
        if(!model.value||/gemini|gpt-|^auto$/i.test(model.value))model.value='claude-sonnet-4-5';
      }
    }
    function aiSaveProviderConfig(){
      const provider=document.querySelector('#aiProviderSelect')?.value||'auto';
      const model=document.querySelector('#aiModelInput')?.value.trim()||'auto';
      aiPilot.provider=provider;aiPilot.model=model;aiPilot.endpoint='/api/failure-analysis';
      localStorage.setItem('centralAI.provider',provider);
      localStorage.setItem('centralAI.model',model);
      aiUpdateProviderUI();showSaveToast('Configuração salva. A Central escolhe automaticamente as fontes e pode usar Gemini + GPT para verificação.','success');
    }
    async function aiCallLLM(payload){
      if((payload.provider||aiPilot.provider)==='gemini') payload.provider='backend';
      const endpoint='/api/failure-analysis';
      const requestPayload={...payload,systemPrompt:AI_SYSTEM_PROMPT,prompt:aiBuildPromptText(payload)};
      const token=auth?.currentUser?await auth.currentUser.getIdToken():null;
       const headers={'Content-Type':'application/json'};
       if(token)headers.Authorization=`Bearer ${token}`;
       const controller=new AbortController();
      const timer=setTimeout(()=>controller.abort(),Number(80000));
      let res;
      try{res=await fetch(endpoint,{method:'POST',headers,body:JSON.stringify(requestPayload),signal:controller.signal});}
      catch(err){if(err?.name==='AbortError')throw new Error('A chamada à IA excedeu o tempo limite do cliente.');throw err;}
      finally{clearTimeout(timer);}
      const data=await res.json().catch(()=>null);
      if(!res.ok)throw new Error(data?.error||data?.message||`Servidor de IA retornou HTTP ${res.status}.`);
      return data||{};
    }
    function aiRenderResultV14(result){
      aiRenderResult(result);
      const sc=document.querySelector('#aiChatScroll');
      if(sc) requestAnimationFrame(()=>{sc.scrollTop=sc.scrollHeight;});
    }
    async function aiCallLLMWithRetry(payload){
      let lastErr=null;
      for(let attempt=1;attempt<=2;attempt++){
        try{return await aiCallLLM(payload);}catch(err){
          lastErr=err;
          if(attempt<2) await new Promise(r=>setTimeout(r,650));
        }
      }
      throw lastErr||new Error('Falha ao consultar a IA.');
    }
    let aiVoiceRecorder=null;
    let aiVoiceChunks=[];
    let aiVoiceStream=null;
    let aiVoiceStartedAt=0;

    function aiVoiceSetState(active, label=''){
      const btn=document.querySelector('#aiVoiceButton');
      if(!btn)return;
      btn.classList.toggle('recording',!!active);
      btn.title=active?'Parar gravação':'Gravar áudio';
      btn.setAttribute('aria-label',active?'Parar gravação':'Gravar áudio');
      if(active){btn.dataset.label=label||'Gravando…';}
      else delete btn.dataset.label;
    }
    function aiBlobToDataUrl(blob){
      return new Promise((resolve,reject)=>{
        const reader=new FileReader();
        reader.onerror=()=>reject(reader.error||new Error('Falha ao ler áudio.'));
        reader.onload=()=>resolve(reader.result);
        reader.readAsDataURL(blob);
      });
    }
    async function aiTranscribeAudio(blob){
      const dataUrl=await aiBlobToDataUrl(blob);
      const token=auth?.currentUser?await auth.currentUser.getIdToken():null;
      const headers={'Content-Type':'application/json'};
      if(token)headers.Authorization=`Bearer ${token}`;
      const res=await fetch('/api/transcribe-audio',{method:'POST',headers,body:JSON.stringify({audioDataUrl:dataUrl,mimeType:blob.type||'audio/webm'})});
      const data=await res.json().catch(()=>null);
      if(!res.ok)throw new Error(data?.error||'Não foi possível transcrever o áudio.');
      return String(data?.text||'').trim();
    }
    async function aiToggleVoice(){
      if(aiVoiceRecorder && aiVoiceRecorder.state==='recording'){
        aiVoiceRecorder.stop();
        return;
      }
      if(!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder==='undefined'){
        showSaveToast('Seu navegador não oferece gravação de áudio.', 'error');
        return;
      }
      try{
        aiVoiceStream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}});
        const mimeCandidates=['audio/webm;codecs=opus','audio/webm','audio/mp4'];
        const mimeType=mimeCandidates.find(t=>MediaRecorder.isTypeSupported?.(t))||'';
        aiVoiceRecorder=new MediaRecorder(aiVoiceStream,mimeType?{mimeType}:undefined);
        aiVoiceChunks=[]; aiVoiceStartedAt=Date.now();
        aiVoiceSetState(true,'Gravando…');
        aiVoiceRecorder.ondataavailable=e=>{if(e.data?.size)aiVoiceChunks.push(e.data)};
        aiVoiceRecorder.onerror=()=>{showSaveToast('A gravação de áudio falhou.','error');aiStopVoiceTracks();aiVoiceSetState(false);};
        aiVoiceRecorder.onstop=async()=>{
          const durationMs=Date.now()-aiVoiceStartedAt;
          aiStopVoiceTracks();
          aiVoiceSetState(false);
          const blob=new Blob(aiVoiceChunks,{type:mimeType||'audio/webm'});
          if(blob.size<2000 || durationMs<350){showSaveToast('O áudio ficou muito curto. Grave novamente.','error');return;}
          const btn=document.querySelector('#aiVoiceButton'); if(btn)btn.disabled=true;
          aiSetThinking(true,'Transcrevendo seu áudio…');
          try{
            const text=await aiTranscribeAudio(blob);
            const c=document.querySelector('#aiContext');
            if(!text){throw new Error('Não identifiquei fala suficiente no áudio.');}
            if(c){c.value=text;c.dispatchEvent(new Event('input',{bubbles:true}));}
            await aiRunV14();
          }catch(err){console.error(err);showSaveToast(err.message||'Falha ao processar áudio.','error');aiSetThinking(false);}finally{if(btn)btn.disabled=false;}
        };
        aiVoiceRecorder.start(250);
      }catch(err){
        aiStopVoiceTracks();aiVoiceSetState(false);
        showSaveToast(err?.name==='NotAllowedError'?'Permita o acesso ao microfone para enviar áudio.':'Não foi possível iniciar o microfone.','error');
      }
    }
    function aiStopVoiceTracks(){
      try{aiVoiceStream?.getTracks?.().forEach(t=>t.stop());}catch{}
      aiVoiceStream=null;aiVoiceRecorder=null;aiVoiceChunks=[];
    }

    function installMobileCentralShell(){
      if(document.querySelector('#mobileMenuToggle'))return;
      const topbar=document.querySelector('.topbar');
      const sidebar=document.querySelector('.sidebar');
      const app=document.querySelector('.app');
      if(!topbar||!sidebar||!app)return;
      const btn=document.createElement('button');
      btn.id='mobileMenuToggle';btn.type='button';btn.className='mobile-menu-toggle';btn.setAttribute('aria-label','Abrir menu');btn.innerHTML='<span></span><span></span><span></span>';
      topbar.prepend(btn);
      const overlay=document.createElement('div');overlay.id='mobileMenuOverlay';overlay.className='mobile-menu-overlay';
      document.body.appendChild(overlay);
      const close=()=>{document.body.classList.remove('mobile-menu-open');btn.setAttribute('aria-label','Abrir menu');};
      btn.addEventListener('click',()=>{document.body.classList.toggle('mobile-menu-open');btn.setAttribute('aria-label',document.body.classList.contains('mobile-menu-open')?'Fechar menu':'Abrir menu');});
      overlay.addEventListener('click',close);
      sidebar.addEventListener('click',e=>{if(e.target.closest('.main-nav button,.side-action,.all-reports'))close();});
      window.addEventListener('resize',()=>{if(window.innerWidth>760)close();},{passive:true});
    }

    async function aiRunV14(){
      aiPilot.context=document.querySelector('#aiContext')?.value.trim()||'';
      const text=aiPilot.context, hasData=!!aiPilot.rows.length, hasImages=!!aiPilot.images.length;
      if(!text&&!hasData&&!hasImages){showSaveToast('Escreva uma pergunta ou envie algum dado.','error');return;}
      const previousAssistant=[...(aiPilot.conversation||[])].reverse().find(x=>x.role==='assistant')?.text||'';
      // Clear immediately after capture so the sent message never remains in the composer while the IA is processing.
      const composerInput=document.querySelector('#aiContext');
      if(composerInput) composerInput.value='';
      if(text)aiSetMessage('user',text);
      if(aiIsGreeting(text)&&!hasData&&!hasImages){aiSetMessage('assistant',aiNaturalReply(text));document.querySelector('#aiContext').value='';await aiSaveConversation();return;}
      if(aiIsCorrection(text)&&!hasData&&!hasImages){
        const hasSpecificCorrection=/(na verdade|o correto|correto é|correta é|deve ser|é porque|significa que|a causa é)/i.test(text);
        if(hasSpecificCorrection){
          const saved=await aiSaveCorrection(text,previousAssistant);
          aiSetMessage('assistant',saved?(aiCanValidateMemory()?'Entendi. Registrei sua correção como conhecimento validado.':'Entendi. Registrei sua correção como evidência pendente de validação.'): 'Entendi a correção, mas não consegui registrá-la na memória.');
        }else aiSetMessage('assistant','Entendi que a minha resposta está errada. Me diga como é o correto e eu registro para a Central.');
        document.querySelector('#aiContext').value='';await aiSaveConversation();return;
      }
      if(document.querySelector('#aiUIAgent')?.checked){
        try{await aiRunUIAgent(text);}catch(err){aiSetThinking(false);console.error(err);showSaveToast('Agente de interface: '+err.message,'error');aiSetMessage('assistant','Não consegui concluir a ação na interface. A tela permaneceu disponível para você continuar manualmente.');}
        document.querySelector('#aiContext').value='';await aiSaveConversation();return;
      }
      const btn=document.querySelector('#aiRunAnalysis');if(btn){btn.disabled=true;btn.innerHTML='<span class="ai-thinking-dots"><i></i><i></i><i></i></span>';}
      const analysisNeeded=aiNeedsAnalysis(text,hasData,hasImages);
      const payload={...aiBuildPayload(),intent:analysisNeeded?'investigation':'conversation',chain:analysisNeeded};
      payload.provider=aiPilot.provider||'auto';
      payload.model=aiPilot.model&&aiPilot.model!=='auto'?aiPilot.model:undefined;
      payload.webResearch='auto';
      try{
        let result=null; let streamed=false; let streamNode=null;
        const shouldStream=(payload.provider==='auto'||payload.provider==='backend'||payload.provider==='gemini') && !hasData && !hasImages;
        if(shouldStream){
          try{
            let temp=''; let visible=''; let pumping=false; let receivedDelta=false; streamNode=aiCreateAssistantElement();
            aiSetLiveStreamStatus(streamNode,'Entendendo a pergunta e escolhendo as fontes relevantes…');
            const pump=()=>{
              if(!streamNode) return;
              if(visible.length<temp.length){
                const remaining=temp.length-visible.length;
                const step=Math.max(3,Math.min(18,Math.ceil(remaining/10)));
                visible+=temp.slice(visible.length,visible.length+step);
                streamNode.bubble.innerHTML=aiMarkdownToHtml(visible)+'<span class="ai-streaming-cursor"></span>';
                pumping=true; requestAnimationFrame(pump);
              } else { pumping=false; }
            };
            const pushDelta=delta=>{
              if(!receivedDelta){receivedDelta=true;aiFinishLiveStream(streamNode);}
              temp+=String(delta||'');
              if(!pumping) requestAnimationFrame(pump);
            };
            const waitReveal=()=>new Promise(resolve=>{ const check=()=>{if(visible.length>=temp.length){resolve();}else{requestAnimationFrame(check);}}; check(); });
            // O backend controla retry/fallback. O navegador mantém uma única requisição
            // para que o botão Cancelar possa abortar exatamente essa execução.
            result=await aiCallLLMStream(payload,pushDelta,status=>{aiSetLiveStreamStatus(streamNode,status);});
            streamed=true;
            const finalText=result.answer||temp||'Não recebi uma resposta textual.';
            temp=finalText; await waitReveal();
            if(streamNode){aiFinishLiveStream(streamNode);streamNode.bubble.innerHTML=aiMarkdownToHtml(finalText);aiRenderSourceMeta(streamNode,result);}
            aiPilot.conversation=aiPilot.conversation||[];aiPilot.conversation.push({role:'assistant',text:finalText,at:now()});
          }catch(streamErr){
            aiFinishLiveStream(streamNode); if(streamNode?.el)streamNode.el.remove();
            if(streamErr?.userCancelled || streamErr?.timeout) throw streamErr;
            console.warn('Streaming indisponível; usando chamada normal com retry/fallback:',streamErr);
            result=await aiCallLLMWithRetry(payload);
          }
        } else {
          result=await aiCallLLMWithRetry(payload);
        }
        if(!streamed){
          const finalText=result?.answer||result?.thinking||'Não recebi uma resposta textual.';
          const node=aiCreateAssistantElement();
          if(node){
            await new Promise(resolve=>{
              let i=0;
              const pump=()=>{
                i=Math.min(finalText.length,i+Math.max(3,Math.min(18,Math.ceil((finalText.length-i)/9))));
                node.bubble.innerHTML=aiMarkdownToHtml(finalText.slice(0,i))+(i<finalText.length?'<span class="ai-streaming-cursor"></span>':'');
                aiScrollChat();
                if(i<finalText.length) requestAnimationFrame(pump); else resolve();
              };
              pump();
            });
            aiRenderSourceMeta(node,result);
          } else aiSetMessage('assistant',finalText);
          aiPilot.conversation=aiPilot.conversation||[]; aiPilot.conversation.push({role:'assistant',text:finalText,at:now()});
        }
        aiPilot.lastResult=result;aiSetThinking(false);
        document.querySelector('#aiContext').value='';await aiSaveConversation();
        showSaveToast('Análise concluída.','success');
      }catch(err){
        aiSetThinking(false);console.error(err);
        if(err?.userCancelled){showSaveToast('Execução cancelada.','success');}
        else {const detail=String(err?.message||'Erro desconhecido na IA.');showSaveToast('Não foi possível consultar a IA: '+detail,'error');aiSetMessage('assistant',`Não consegui concluir esta consulta.

**Motivo:** ${detail}

A execução foi encerrada para não deixar a Central presa em espera.`);}
      }finally{if(btn){btn.disabled=false;btn.innerHTML='<span class="svg-icon send-icon"></span>';}}
    }


    // V14.22 — interface adaptativa: contexto automático + sidebar recolhível + guia de uso
    function aiSelectedContextText(){
      const xs=Array.isArray(aiPilot.focusedCentralContext)?aiPilot.focusedCentralContext:[];
      if(!xs.length)return 'Nenhum registro vinculado';
      const labels=xs.slice(0,4).map(x=>x.label).filter(Boolean); return xs.length<=4?labels.join(' · '):`${labels.join(' · ')} + ${xs.length-4} outro(s)`;
    }
    function aiRenderFocusedContext(){
      const xs=Array.isArray(aiPilot.focusedCentralContext)?aiPilot.focusedCentralContext:[];
      const summary=document.querySelector('#aiContextSummary'); if(summary)summary.textContent=aiSelectedContextText();
      document.querySelector('#aiInvestigationContext .ai-context-dot')?.classList.toggle('active',xs.length>0);
      const stateEl=document.querySelector('#aiDataState'); if(stateEl)stateEl.textContent=xs.length?`${xs.length} registro(s) vinculado(s) à investigação`:`Memória da Central disponível`;
    }
    function aiCentralPickerRecords(){
      const out=[];
      (state.reports||[]).forEach(r=>out.push({key:`report:${r.docId||r.id}`,source:'Report',id:r.docId||r.id||'',label:`${r.id||r.docId||'Report'} — ${r.issue||r.defect||r.component||'Falha de produto'}`,detail:[r.product||r.produto,r.component||r.componente,r.material].filter(Boolean).join(' · '),record:{tipo:'Report',id:r.id||r.docId||'',produto:r.product||r.produto||'',familia:r.family||r.familia||'',defeito:r.issue||r.defect||r.defeito||'',componente:r.component||r.componente||'',material:r.material||'',responsavel:r.owner||'',quantidade:r.quantity||1,data:r.createdAt||r.date||'',status:r.status||'',hipotese:r.analysis?.hypothesis||r.hypothesis||'',causa:r.analysis?.cause||r.cause||''}}));
      (state.operationalFailures||[]).forEach(r=>out.push({key:`op:${r.docId||r.id}`,source:'Operacional',id:r.docId||r.id||'',label:`${r.id||r.docId||'Ocorrência'} — ${r.issue||r.defect||r.damagedPart||'Falha operacional'}`,detail:[r.product||r.produto,r.station||r.estacao,r.machine||r.maquina].filter(Boolean).join(' · '),record:{tipo:r.occurrenceMode||'Operacional',id:r.id||r.docId||'',produto:r.product||r.produto||'',familia:r.family||r.familia||'',defeito:r.issue||r.defect||r.defeito||'',maquina:r.machine||r.maquina||'',linha:r.line||r.linha||'',estacao:r.station||r.estacao||'',operacao:r.operation||r.operacao||'',turno:r.shift||r.turno||'',componente:r.damagedPart||r.component||r.componente||'',quantidade:r.quantity||1,data:r.createdAt||r.date||'',status:r.status||'',hipotese:r.hypothesis||'',causa:r.cause||''}}));
      (state.failureAnalyses||[]).forEach(r=>out.push({key:`analysis:${r.docId||r.id}`,source:'Análise',id:r.docId||r.id||'',label:`${r.id||r.docId||'Análise'} — ${r.title||r.problem||'Investigação anterior'}`,detail:r.perspective||r.status||'',record:{tipo:'Análise anterior',id:r.id||r.docId||'',titulo:r.title||'',problema:r.problem||'',perspectiva:r.perspective||'',status:r.status||'',resultado:r.result||{}}}));
      const product=activeProduct?.id||activeProduct?.name; const preferred=out.filter(x=>{const txt=JSON.stringify(x.record).toLowerCase();return product&&txt.includes(String(product).toLowerCase());});
      return [...preferred,...out.filter(x=>!preferred.includes(x))].slice(0,60);
    }
    function aiOpenContextPicker(){
      const wrap=document.querySelector('#aiContextPicker'),list=document.querySelector('#aiContextPickerList');if(!wrap||!list)return;
      const selected=new Set((aiPilot.focusedCentralContext||[]).map(x=>x.key));
      const records=aiCentralPickerRecords();
      list.innerHTML=records.length?records.map(x=>`<label class="ai-context-item"><input type="checkbox" data-context-key="${aiEsc(x.key)}" ${selected.has(x.key)?'checked':''}><span><strong>${aiEsc(x.label)}</strong><span>${aiEsc(x.detail||x.source)}</span></span></label>`).join(''):'<div class="empty">Nenhum registro disponível na Central.</div>';
      const updateCount=()=>{const n=list.querySelectorAll('input[type=checkbox]:checked').length;const c=document.querySelector('#aiContextPickerCount');if(c)c.textContent=`${n} selecionado(s)`;};updateCount();wrap.classList.remove('hidden');
      list.onchange=updateCount;
    }
    function aiCloseContextPicker(){document.querySelector('#aiContextPicker')?.classList.add('hidden');}
    function aiApplyContextPicker(){
      const records=aiCentralPickerRecords(); const wanted=new Set([...document.querySelectorAll('#aiContextPickerList input[data-context-key]:checked')].map(x=>x.dataset.contextKey));
      aiPilot.focusedCentralContext=records.filter(x=>wanted.has(x.key)).map(x=>({key:x.key,source:x.source,id:x.id,label:x.label,detail:x.detail,record:x.record}));
      aiRenderFocusedContext();aiCloseContextPicker();aiScrollChat();
      if(aiPilot.focusedCentralContext.length)showSaveToast('Contexto da investigação atualizado.','success');
    }
    function enforceCentralUIIntegrity(){
      // A collapse control belongs only to the Central sidebar. Remove any legacy/dynamic copy elsewhere.
      document.querySelectorAll('.main > .topbar .sidebar-collapse, .main > .topbar [data-sidebar-collapse], .main > .topbar #sidebarCollapse').forEach(el=>el.remove());
      // Remove a legacy standalone dash/placeholder from the left side of the Central header.
      const topbar=document.querySelector('.main > .topbar');
      const heading=topbar?.firstElementChild;
      if(heading && !heading.querySelector('.page-title:not(:empty), .page-subtitle:not(:empty)')) heading.remove();
      document.querySelectorAll('.sidebar .main-nav button[data-page]').forEach(btn=>{
        btn.classList.remove('sidebar-icon-legacy');
      });
    }


    // V15.1.13.22 — mobile navigation, visual viewport and full-screen interaction surfaces.
    const MOBILE_UI_QUERY = '(max-width: 930px)';
    const CORA_MOBILE_QUERY = '(max-width: 760px)';

    function isMobileUI(){
      return window.matchMedia(MOBILE_UI_QUERY).matches;
    }

    function setMobileVisualViewport(){
      const viewport = window.visualViewport;
      const height = Math.max(320, Math.round(viewport?.height || window.innerHeight || document.documentElement.clientHeight || 0));
      document.documentElement.style.setProperty('--app-visual-height', `${height}px`);
      document.documentElement.style.setProperty('--cora-input-font', window.matchMedia(CORA_MOBILE_QUERY).matches ? '16px' : '14px');
    }

    function closeMobileNavigation(){
      document.body.classList.remove('sidebar-open');
      const toggle = document.querySelector('#mobileNavToggle');
      if(toggle) toggle.setAttribute('aria-expanded','false');
    }

    function openMobileNavigation(){
      if(!isMobileUI()) return;
      document.body.classList.add('sidebar-open');
      document.body.classList.remove('sidebar-collapsed');
      const toggle = document.querySelector('#mobileNavToggle');
      if(toggle) toggle.setAttribute('aria-expanded','true');
    }

    function closeCoraMobileNavigation(){
      document.body.classList.remove('cora-mobile-nav-open');
      document.documentElement.style.removeProperty('--cora-mobile-drawer-x');
      const panel=document.querySelector('#aiCoraSidebar');
      panel?.classList.remove('open');
      const toggle=document.querySelector('#aiMobileMenu');
      if(toggle) toggle.setAttribute('aria-expanded','false');
    }

    function openCoraMobileNavigation(){
      if(!window.matchMedia(CORA_MOBILE_QUERY).matches) return;
      document.body.classList.add('cora-mobile-nav-open');
      document.documentElement.style.setProperty('--cora-mobile-drawer-x','0%');
      const panel=document.querySelector('#aiCoraSidebar');
      panel?.classList.add('open');
      const toggle=document.querySelector('#aiMobileMenu');
      if(toggle) toggle.setAttribute('aria-expanded','true');
    }

    function updateMobileModalState(){
      const openModal=[...document.querySelectorAll('.modal-backdrop')].some(el=>!el.classList.contains('hidden'));
      document.body.classList.toggle('mobile-modal-open',isMobileUI() && openModal);
    }

    function syncMobileMode(){
      setMobileVisualViewport();
      if(isMobileUI()){
        document.body.classList.add('mobile-ui');
        // Desktop collapsed state must never shrink a mobile drawer to an icon rail.
        document.body.classList.remove('sidebar-collapsed');
      }else{
        document.body.classList.remove('mobile-ui','sidebar-open','cora-mobile-nav-open','mobile-modal-open');
        document.documentElement.style.removeProperty('--cora-mobile-drawer-x');
        const savedCollapse=localStorage.getItem('centralAI.sidebarCollapsed')==='true';
        document.body.classList.toggle('sidebar-collapsed',savedCollapse);
      }
      if(!window.matchMedia(CORA_MOBILE_QUERY).matches) closeCoraMobileNavigation();
      updateMobileModalState();
    }

    function initMobileExperience(){
      setMobileVisualViewport();
      syncMobileMode();

      const mobileToggle=document.querySelector('#mobileNavToggle');
      const mobileBackdrop=document.querySelector('#mobileNavBackdrop');
      const coraToggle=document.querySelector('#aiMobileMenu');
      const coraBackdrop=document.querySelector('#aiMobileBackdrop');

      if(mobileToggle && mobileToggle.dataset.bound!=='true'){
        mobileToggle.dataset.bound='true';
        mobileToggle.addEventListener('click',event=>{
          event.preventDefault();
          document.body.classList.contains('sidebar-open') ? closeMobileNavigation() : openMobileNavigation();
        });
      }
      mobileBackdrop?.addEventListener('click',closeMobileNavigation);

      if(coraToggle && coraToggle.dataset.bound!=='true'){
        coraToggle.dataset.bound='true';
        coraToggle.addEventListener('click',event=>{
          event.preventDefault();
          document.body.classList.contains('cora-mobile-nav-open') ? closeCoraMobileNavigation() : openCoraMobileNavigation();
        });
      }
      coraBackdrop?.addEventListener('click',closeCoraMobileNavigation);

      document.addEventListener('click',event=>{
        if(isMobileUI() && event.target.closest('.sidebar button[data-page], .sidebar [data-family-toggle], .sidebar [data-base-family][data-base-code], .sidebar .product-btn, .sidebar .all-reports')){
          setTimeout(closeMobileNavigation,0);
        }
        if(window.matchMedia(CORA_MOBILE_QUERY).matches && event.target.closest('#aiCoraSidebar .ai-side-link, #aiCoraSidebar #aiNewChat, #aiCoraSidebar #aiFocusBack')){
          setTimeout(closeCoraMobileNavigation,0);
        }
      });

      document.addEventListener('keydown',event=>{
        if(event.key!=='Escape') return;
        closeMobileNavigation();
        closeCoraMobileNavigation();
      });

      const media=window.matchMedia(MOBILE_UI_QUERY);
      media.addEventListener?.('change',syncMobileMode);
      window.addEventListener('resize',syncMobileMode,{passive:true});
      window.addEventListener('orientationchange',()=>setTimeout(syncMobileMode,60),{passive:true});
      window.visualViewport?.addEventListener('resize',setMobileVisualViewport,{passive:true});
      window.visualViewport?.addEventListener('scroll',setMobileVisualViewport,{passive:true});

      const modalObserver=new MutationObserver(updateMobileModalState);
      modalObserver.observe(document.body,{subtree:true,attributes:true,attributeFilter:['class']});

      document.addEventListener('focusin',event=>{
        if(!isMobileUI()) return;
        const field=event.target.closest('.modal input, .modal textarea, .modal select, .account-card input, .account-card textarea, #aiContext');
        if(!field) return;
        setTimeout(()=>{
          const vv=window.visualViewport;
          const keyboardOpen=vv && vv.height < window.innerHeight - 80;
          if(keyboardOpen) field.scrollIntoView({block:'center',inline:'nearest',behavior:'smooth'});
        },120);
      });
    }

    function initV1424Interface(){
      enforceCentralUIIntegrity();
      const navShortMap={home:'⌂',dashboard:'▦',product:'F',operations:'O',work:'✓',flow:'≡',aiAnalysis:'C',profile:'P'};
      document.querySelectorAll('.main-nav button[data-page]').forEach(btn=>{
        const page=btn.dataset.page||'';
        if(!btn.dataset.short) btn.dataset.short=navShortMap[page]||page.slice(0,1).toUpperCase();
      });
      const savedCollapse=localStorage.getItem('centralAI.sidebarCollapsed')==='true';
      document.body.classList.toggle('sidebar-collapsed',savedCollapse);
      const toggle=document.querySelector('#sidebarCollapse');
      const updateToggle=()=>{if(!toggle)return;const c=document.body.classList.contains('sidebar-collapsed');toggle.dataset.collapsed=String(c);toggle.title=c?'Expandir menu':'Recolher menu';toggle.setAttribute('aria-label',toggle.title);toggle.setAttribute('aria-expanded',String(!c));};
      if(toggle && toggle.dataset.bound!=='true'){
        toggle.dataset.bound='true';
        toggle.addEventListener('click',event=>{
          event.preventDefault();
          event.stopPropagation();
          if(isMobileUI()){
            closeMobileNavigation();
            return;
          }
          const c=!document.body.classList.contains('sidebar-collapsed');
          document.body.classList.toggle('sidebar-collapsed',c);
          localStorage.setItem('centralAI.sidebarCollapsed',String(c));
          updateToggle();
        });
      }
      updateToggle();
      // O vínculo de contexto agora é automático. Ações manuais continuam disponíveis
      // apenas por anexos de evidência, sem seleção obrigatória de fontes.
      aiPilot.focusedCentralContext=[];
      aiUpdateAIState();
    }


    async function aiShareConversation(){
      const messages=Array.isArray(aiPilot.conversation)?aiPilot.conversation:[];
      if(!messages.length)return showSaveToast('Ainda não há mensagens para compartilhar.','error');
      const title=(messages.find(x=>x.role==='user')?.text||'Conversa CORA').slice(0,80);
      const text=messages.map(m=>`${m.role==='user'?'Você':'CORA'}:
${m.text}`).join('\n\n');
      try{
        if(navigator.share){await navigator.share({title:`CORA — ${title}`,text});await auditAI('share',{title});return;}
        await navigator.clipboard.writeText(text);showSaveToast('Conversa copiada para a área de transferência.','success');
      }catch(err){if(err?.name!=='AbortError'){try{await navigator.clipboard.writeText(text);showSaveToast('Conversa copiada para a área de transferência.','success');}catch(_){showSaveToast('Não foi possível compartilhar a conversa.','error');}}}
    }
    function initAIv14(){
      document.querySelector('#aiNewChat')?.addEventListener('click',aiResetChat);
      document.querySelector('#aiFocusBack')?.addEventListener('click',()=>show(aiPreviousView||'home'));
      document.querySelector('#aiShareConversation')?.addEventListener('click',aiShareConversation);
      document.querySelector('#aiThemeToggle')?.addEventListener('click',()=>{
        const dark=!document.body.classList.contains('dark');
        document.body.classList.toggle('dark',dark);
        document.documentElement.classList.toggle('dark',dark);
        localStorage.setItem('centralAI.theme',dark?'dark':'light');
        const global=document.querySelector('#themeToggle');
        if(global) global.setAttribute('aria-pressed',String(dark));
      });
      document.querySelector('#aiShareConversationMenu')?.addEventListener('click',()=>{document.querySelector('#aiAddMenu')?.classList.add('hidden');aiShareConversation();});
      document.querySelector('#aiAddButton')?.addEventListener('click',e=>{e.stopPropagation();document.querySelector('#aiAddMenu')?.classList.toggle('hidden');});
      document.querySelector('#aiVoiceButton')?.addEventListener('click',aiToggleVoice);
      installMobileCentralShell();
      document.addEventListener('click',e=>{if(!e.target.closest('#aiAddMenu')&&!e.target.closest('#aiAddButton'))document.querySelector('#aiAddMenu')?.classList.add('hidden');});
      document.querySelectorAll('[data-ai-add]')?.forEach(b=>b.addEventListener('click',()=>{document.querySelector('#aiAddMenu')?.classList.add('hidden'); if(b.dataset.aiAdd==='image')document.querySelector('#aiImageInput')?.click(); else document.querySelector('#aiFileInput')?.click();}));
      const composer=document.querySelector('#aiContext');
      const autoGrow=()=>{if(!composer)return;composer.style.height='auto';composer.style.height=Math.min(180,Math.max(38,composer.scrollHeight))+'px';composer.style.overflowY=composer.scrollHeight>180?'auto':'hidden';};
      composer?.addEventListener('input',autoGrow); autoGrow();
      document.addEventListener('click',async e=>{const pin=e.target.closest('[data-ai-pin-conversation]');if(pin){e.stopPropagation();await toggleAIConversationPin(pin.dataset.aiPinConversation);return;}const item=e.target.closest('[data-ai-open-conversation]');if(item&&!e.target.closest('[data-ai-pin-conversation]')){await openAIConversation(item.dataset.aiOpenConversation);}});
      document.querySelector('#aiNewChat')?.addEventListener('click',()=>setTimeout(autoGrow,0));
      document.querySelectorAll('[data-ai-side]').forEach(b=>b.addEventListener('click',()=>{
        const mode=b.dataset.aiSide;
        document.querySelectorAll('[data-ai-side]').forEach(x=>x.classList.toggle('active',x===b));
        document.querySelector('#aiConversation')?.classList.toggle('hidden',mode!=='chat');
        document.querySelector('#aiResult')?.classList.toggle('hidden',mode!=='chat');
        document.querySelector('#aiHistoryPanel')?.classList.toggle('hidden',mode!=='history');
        document.querySelector('#aiMemoryPanel')?.classList.toggle('hidden',mode!=='memory');
        if(mode==='history')renderAIHistory(); if(mode==='memory')renderAIMemoryPanel(); if(mode==='metrics')renderAIMetricsPanel();
      }));
      document.addEventListener('click',async e=>{
        const promote=e.target.closest('[data-ai-promote-memory]');
        if(promote){await aiPromoteKnowledge(promote.dataset.aiPromoteMemory);return;}
        const fb=e.target.closest('[data-ai-feedback]');
        if(!fb)return;
        if(fb.dataset.aiFeedback==='wrong'){
          const c=document.querySelector('#aiContext');if(c){c.value='Não é assim. ';c.focus();}
        }else showSaveToast('Obrigado. Vou considerar essa resposta como útil.','success');
      });
      document.querySelectorAll('[data-ai-suggestion]').forEach(b=>b.addEventListener('click',()=>{const action=b.dataset.aiAction;const c=document.querySelector('#aiContext');if(action==='image'){document.querySelector('#aiImageInput')?.click();if(c){c.value=b.dataset.aiSuggestion||'Quero analisar a foto que enviei e separar observações visuais de hipóteses.';c.focus();}return;}if(action==='central'){if(c){c.value=b.dataset.aiSuggestion||'Procure padrões e relações nos dados disponíveis que eu talvez não esteja percebendo.';c.focus();}return;}if(c){c.value=b.dataset.aiSuggestion;c.focus();}}));
      document.querySelector('#aiImageInput')?.addEventListener('change',e=>aiReadImages(e.target.files).catch(err=>showSaveToast('Erro ao ler imagem: '+err.message,'error')));
      document.querySelector('#aiFileInput')?.addEventListener('change',e=>aiReadFiles(e.target.files).catch(err=>showSaveToast('Erro ao ler arquivo: '+err.message,'error')));
      document.querySelector('#aiClearAttachments')?.addEventListener('click',()=>{aiPilot.images=[];aiPilot.dataFiles=[];aiRebuildDataFiles();aiRenderAttachments();aiUpdateAIState();});
      document.querySelectorAll('[data-ai-export]')?.forEach(b=>b.addEventListener('click',()=>{document.querySelector('#aiAddMenu')?.classList.add('hidden');aiGenerateArtifact(b.dataset.aiExport);}));
      document.querySelectorAll('[data-ai-generate]')?.forEach(b=>b.addEventListener('click',()=>{document.querySelector('#aiAddMenu')?.classList.add('hidden');const type=b.dataset.aiGenerate;if(type==='slides')aiGenerateSlidesFromChat();else if(type==='image')aiGenerateImageFromChat();}));
      document.querySelector('#aiSaveProvider')?.addEventListener('click',aiSaveProviderConfig);
      
      document.querySelector('#aiProviderSelect')?.addEventListener('change',aiUpdateProviderUI);
      document.querySelector('#aiPerspectiveSelect')?.addEventListener('change',e=>{aiPilot.perspective=e.target.value;});
      document.querySelector('#aiDepthSelect')?.addEventListener('change',e=>{aiPilot.depth=e.target.value;});
      document.querySelector('#aiRunAnalysis')?.removeEventListener('click',aiRun);
      document.querySelector('#aiRunAnalysis')?.addEventListener('click',aiRunV14);
      document.querySelector('#aiContext')?.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();aiRunV14();}});
      document.addEventListener('click',e=>{const b=e.target.closest('[data-ai-remove-image]');if(b){aiPilot.images.splice(Number(b.dataset.aiRemoveImage),1);aiRenderAttachments();aiUpdateAIState();return;}const f=e.target.closest('[data-ai-remove-file]');if(f){aiPilot.dataFiles.splice(Number(f.dataset.aiRemoveFile),1);aiRebuildDataFiles();aiRenderAttachments();renderAIAnalysis();aiUpdateAIState();}});
      aiLoadProviderConfig(); aiUpdateAIState(); renderAIHistory(); renderAIMemoryPanel();
    }
    // V14.11 — blindagem: falha na inicialização da IA não pode derrubar o restante da Central.
    try {
      initAIv14();
    } catch (aiInitError) {
      console.error('Falha ao inicializar a IA. Login e demais módulos permanecem independentes:', aiInitError);
      try { showSaveToast('A IA não pôde ser inicializada. O restante da Central continua disponível.', 'error'); } catch (_) {}
    }
    // ======================= FIM V14.1 — IA multimodal ======================
    // ======================= FIM V14.0 — IA DE ANÁLISE (legado) =======================

    function renderSafely(name, fn) {
      try {
        fn();
      } catch (error) {
        console.error(`[Central] Erro ao renderizar ${name}:`, error);
      }
    }

    function render() {
      // Primeiro garante a página correta. Nenhum renderer secundário pode
      // impedir a troca de tela.
      applyActiveView();

      renderSafely('árvore de produtos', renderTree);
      renderSafely('cabeçalho', updatePageHeader);
      renderSafely('falhas de produto', renderProduct);
      renderSafely('todos os reports', renderAll);
      renderSafely('falhas operacionais', renderOperations);
      renderSafely('atividades gerais', renderWork);
      renderSafely('fluxos', renderFlows);
      renderSafely('IA de análise', renderAIAnalysis);
      renderSafely('dashboard', renderDashboard);
      renderSafely('perfil', renderProfile);
      renderSafely('início', renderHome);
      renderSafely('conta', renderAccount);
      renderSafely('tradução', translatePage);

      // Reaplica no final para garantir consistência mesmo se algum módulo
      // tiver alterado o DOM durante a atualização.
      applyActiveView();
    }

    function show(view) {
      if (!view) return;
      const enteringCora = view === 'aiAnalysis' && activeView !== 'aiAnalysis';
      const leavingCora = activeView === 'aiAnalysis' && view !== 'aiAnalysis';
      if (enteringCora) {
        aiPreviousView = activeView;
        enterCoraRoute();
      }
      if (leavingCora) exitCoraRoute();
      activeView = view;
      if (view === 'product' || view === 'all') expandedSidebarSection = 'product';
      else if (view === 'operations') expandedSidebarSection = 'operations';
      else if (view !== 'product' && view !== 'all' && view !== 'operations') {
        expandedSidebarSection = '';
        activeFamily = '';
        localStorage.removeItem('central.sidebar.productActiveFamily.v1');
      }
      localStorage.setItem('central.sidebar.expanded.v1', expandedSidebarSection);
      document.body.classList.toggle('ai-focus-mode', activeView === 'aiAnalysis');
      if (view !== 'dashboard') {
        dashboardIndicatorKind = null;
        const panel = document.querySelector('#dashboardIndicatorPanel');
        if (panel) panel.classList.add('hidden');
        document.querySelectorAll('[data-dashboard-indicator]').forEach(card => card.classList.remove('dashboard-indicator-selected'));
      }
      render();
      if (isMobileUI()) closeMobileNavigation();
      if (activeView !== 'aiAnalysis') closeCoraMobileNavigation();
      if (activeView === 'aiAnalysis') {
        enterCoraRoute();
        applyCoraPageLayout(true);
      }
    }


    function updateProductCodePreview() {
      const form = document.querySelector('#productForm');
      if (!form) return;
      const base = String(form.elements.baseCode?.value || '').trim();
      const color = String(form.elements.color?.value || '').trim();
      const preview = form.elements.codePreview;
      if (preview) preview.value = base + color;
    }
    function fillProductFamilySelector(selectedFamily='') {
      const select = document.querySelector('#productFamilySelect');
      const input = document.querySelector('#productNewFamily');
      if (!select) return;
      const families = [...new Set((state.products || []).map(p => String(p.family || '').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
      const safeSelected = selectedFamily && families.includes(selectedFamily) ? selectedFamily : '';
      select.innerHTML = '<option value="">Selecione uma família existente…</option>' +
        families.map(f => `<option value="${esc(f)}">${esc(f)}</option>`).join('') +
        '<option value="__NEW__">+ Criar nova família</option>';
      select.value = safeSelected || (selectedFamily ? '__NEW__' : '');
      input?.classList.toggle('hidden', select.value !== '__NEW__');
      if (input) input.required = select.value === '__NEW__';
      if (input && select.value !== '__NEW__') input.value = '';
    }
    function syncProductFamilyInput() {
      const select = document.querySelector('#productFamilySelect');
      const input = document.querySelector('#productNewFamily');
      if (!select) return;
      const creating = select.value === '__NEW__';
      input?.classList.toggle('hidden', !creating);
      if (input) input.required = creating;
      if (creating) input?.focus();
      else if (input) input.value = '';
    }
    function openProductModal() {
      const preferredFamily = expandedProductFamily || activeData()?.family || '';
      document.querySelector('#productModal').classList.remove('hidden');
      fillProductFamilySelector(preferredFamily);
      updateProductCodePreview();
      document.querySelector('#productFamilySelect')?.focus();
    }
    function closeProductModal() {
      document.querySelector('#productModal').classList.add('hidden');
      document.querySelector('#productForm').reset();
      syncProductFamilyInput();
      updateProductCodePreview();
    }
    function openComponentModal(returnToFailure = false) { if (!activeData()) return openProductModal(); continueToFailureAfterComponent = returnToFailure; document.querySelector('#componentModalSubtitle').textContent = `Produto selecionado: ${activeData().code} · ${activeData().family}`; document.querySelector('#componentModal').classList.remove('hidden'); document.querySelector('#componentForm input').focus(); }
    function closeComponentModal() { document.querySelector('#componentModal').classList.add('hidden'); document.querySelector('#componentForm').reset(); continueToFailureAfterComponent = false; }
    function fillFailureComponents() { const components = activeData()?.components || []; document.querySelector('#failureComponent').innerHTML = '<option value="">Selecione</option>' + components.sort((a, b) => a.localeCompare(b)).map(component => `<option value="${esc(component)}">${esc(component)}</option>`).join(''); }
    function openFailureModal() { if (!activeData()) return openProductModal(); if (!(activeData().components || []).length) return openComponentModal(true); fillFailureComponents(); document.querySelector('#failureOwnerDisplay').value = currentAccount?.name || 'Usuário atual'; document.querySelector('#failureModalSubtitle').textContent = `Produto selecionado: ${activeData().code} · ${activeData().family}`; document.querySelector('#failureModal').classList.remove('hidden'); document.querySelector('#failureComponent').focus(); }
    function closeFailureModal() { document.querySelector('#failureModal').classList.add('hidden'); document.querySelector('#failureForm').reset(); }
    function fillActivityProducts(){ const select=document.querySelector('#activityProduct'); if(!select)return; const current=select.value; select.innerHTML='<option value="">Não relacionado a produto</option>'+state.products.sort((a,b)=>a.code.localeCompare(b.code)).map(p=>`<option value="${esc(p.code)}">${esc(p.code)} · ${esc(p.family)}</option>`).join(''); select.value=current||activeProduct||''; }
    function openActivityModal() { fillActivityProducts(); updateOwnerDropdowns(); translatePage(); document.querySelector('#activityModal').classList.remove('hidden'); document.querySelector('#activityForm [name="title"]').focus(); }
    function closeActivityModal() { document.querySelector('#activityModal').classList.add('hidden'); document.querySelector('#activityForm').reset(); }
    function openDetail(id) { selectedId = id; renderDetail(); document.querySelector('#detailModal').classList.remove('hidden'); }
    function closeDetail() { document.querySelector('#detailModal').classList.add('hidden'); selectedId = null; }
    const selected = () => state.reports.find(r => r.id === selectedId);

    function openActivityDetail(id) { selectedActivityId = id; renderActivityDetail(); document.querySelector('#activityDetailModal').classList.remove('hidden'); }
    function closeActivityDetail() { document.querySelector('#activityDetailModal').classList.add('hidden'); selectedActivityId = null; }
    const selectedActivity = () => state.activities.find(activity => activity.id === selectedActivityId);

    function renderActivityDetail() {
      const activity = selectedActivity();
      if (!activity) return;
      document.querySelector('#activityDetailTitle').textContent = activity.title;
      document.querySelector('#activityDetailSubtitle').textContent = `${activity.type} · ${activity.area} · Responsável: ${activity.owner}`;
      document.querySelector('#activityDetailDescription').textContent = activity.description;
      document.querySelector('#activityDetailDescriptionInput').value = activity.description || '';
      document.querySelector('#activityDescriptionEditor').classList.add('hidden');
      document.querySelector('#activityDetailDescription').classList.remove('hidden');
      document.querySelector('#activityDetailLink').innerHTML = safeLink(activity.link, 'Abrir link relacionado') || 'Nenhum link informado.';
      document.querySelector('#activityDetailStatus').value = activity.status;
      document.querySelector('#activityDetailDue').value = activity.dueDate || '';
      const events = [{ text: 'Atividade criada.', date: activity.createdAt }, ...(activity.updates || [])].sort((a, b) => new Date(b.date) - new Date(a.date));
      document.querySelector('#activityTimeline').innerHTML = events.map(event => `<div class="event"><time>${formatDate(event.date)}</time><p>${esc(event.text)}</p></div>`).join('');
      translatePage();
    }

    function fillFlowProducts() { const select = document.querySelector('#flowProduct'); select.innerHTML = `<option value="">${esc(t('Não relacionado a produto'))}</option>` + state.products.sort((a, b) => a.code.localeCompare(b.code)).map(product => `<option value="${esc(product.code)}">${esc(product.code)} · ${esc(product.family)}</option>`).join(''); }
    function openFlowModal() { fillFlowProducts(); updateOwnerDropdowns(); translatePage(); document.querySelector('#flowModal').classList.remove('hidden'); document.querySelector('#flowForm select').focus(); }
    function closeFlowModal() { document.querySelector('#flowModal').classList.add('hidden'); document.querySelector('#flowForm').reset(); }

    function openFlowDetail(id) { selectedFlowId = id; renderFlowDetail(); document.querySelector('#flowDetailModal').classList.remove('hidden'); }
    function closeFlowDetail() { document.querySelector('#flowDetailModal').classList.add('hidden'); selectedFlowId = null; }
    const selectedFlow = () => state.flows.find(flow => flow.id === selectedFlowId);

    function renderFlowDetail() {
      const flow = selectedFlow();
      if (!flow) return;
      document.querySelector('#flowDetailTitle').textContent = `${flow.id} · ${flow.scope}`;
      document.querySelector('#flowDetailSubtitle').textContent = `${flow.product || 'Sem produto relacionado'} · aberto por ${flow.creator}`;
      document.querySelector('#flowDetailDescription').textContent = flow.description;
      document.querySelector('#flowDetailAttachment').value = '';
      document.querySelector('#flowDetailEmailLink').value = flow.emailLink || '';
      document.querySelector('#flowDetailCoverLink').value = flow.coverLink || '';
      updateOwnerDropdowns();
      document.querySelector('#flowDetailOwnerSelect').value = flow.followUpOwner || '';
      document.querySelector('#flowDetailFollowUpLink').value = flow.followUpLink || '';
      const flowLinks = [safeLink(flow.emailLink, 'E-mail enviado'), safeLink(flow.coverLink, 'Folha de rosto'), safeLink(flow.followUpLink, 'Registro de seguimento')].filter(Boolean);
      document.querySelector('#flowDetailFiles').innerHTML = `${evidenceGallery(flow.formAttachment,{allowDelete:true,kind:'flow',id:flow.id})}${flowLinks.join('')}`;
      const steps = completedFlowSteps(flow);
      document.querySelector('#flowSteps').innerHTML = Object.entries(steps).map(([step, completed]) => `<div class="task"><span>${flowTaskName[step]}</span>${completed ? '<span class="status done">Concluída</span>' : '<span class="status pending">Pendente</span>'}</div>`).join('');
      document.querySelector('#flowDetailStatus').innerHTML = activityChip(calculatedFlowStatus(flow));
      const events = [{ text: 'Fluxo criado.', date: flow.createdAt }, ...(flow.updates || [])].sort((a, b) => new Date(b.date) - new Date(a.date));
      document.querySelector('#flowTimeline').innerHTML = events.map(event => `<div class="event"><time>${formatDate(event.date)}</time><p>${esc(event.text)}</p></div>`).join('');
      translatePage();
    }

    function renderDetail() {
      const r = selected();
      if (!r) return;
      document.querySelector('#detailTitle').textContent = `${r.id} · ${r.component || r.maquina || 'Falha Operacional'}`;
      document.querySelector('#detailSubtitle').textContent = `${r.product} · ${r.family} · ${r.material || 'Sem código de material'} · Responsável: ${r.owner}`;
      document.querySelector('#detailIssue').textContent = r.issue;
      const nameInput=document.querySelector('#failureNameInput'); if(nameInput) nameInput.value=r.issue||'';
      document.querySelector('#failureNameEditor')?.classList.add('hidden');
      const links = [safeLink(r.reportLink, 'Abrir meu report'), safeLink(r.responseLink, 'Abrir resposta do fornecedor')].filter(Boolean);
      document.querySelector('#detailLinks').innerHTML = links.length ? links.join('') : 'Nenhum link informado.';
      document.querySelector('#detailReportLink').value = r.reportLink || '';
      const responseEnabled = Boolean(r.responseLink);
      document.querySelector('#enableResponseLink').checked = responseEnabled;
      document.querySelector('#responseLinkField').classList.toggle('hidden', !responseEnabled);
      document.querySelector('#detailResponseLink').value = r.responseLink || '';
      document.querySelector('#detailEvidenceInput').value = '';
      document.querySelector('#detailEvidence').innerHTML = evidenceGallery(r.evidence,{allowDelete:true,kind:'report',id:r.id});
      const a = r.analysis || {};
      document.querySelector('#analysisProblem').value = a.problem || '';
      document.querySelector('#analysisWhere').value = a.where || '';
      document.querySelector('#analysisWhen').value = a.when || '';
      document.querySelector('#analysisAffected').value = a.affected ?? '';
      document.querySelector('#analysisHypothesis').value = a.hypothesis || '';
      document.querySelector('#analysisTests').value = a.tests || '';
      document.querySelector('#analysisCause').value = a.cause || '';
      document.querySelector('#analysisAction').value = a.action || '';
      document.querySelector('#analysisNotes').value = a.notes || '';
      document.querySelector('#detailQuantity').value = r.quantity ?? '';
      document.querySelector('#detailQuantityPeriod').value = r.quantityPeriod || '';
      document.querySelector('#detailQuantityNotes').value = r.quantityNotes || '';
      document.querySelector('#quantityHistory').innerHTML = (r.quantityHistory || []).length ? (r.quantityHistory || []).slice().reverse().map(h => `<div class="secondary-text">${formatDate(h.date)} · ${h.from ?? 0} → ${h.to ?? 0} peças${h.delta != null ? ` (${h.delta >= 0 ? '+' : ''}${h.delta})` : ''}</div>`).join('') : '<span class="muted">Nenhuma atualização de quantidade registrada.</span>';
      document.querySelector('#generatedOutput').classList.add('hidden');
      const tasks = completedTasks(r);
      document.querySelector('#detailStatus').innerHTML = chip(calculatedStatus(r));
      const emailStatusEl=document.querySelector('#detailEmailStatus');if(emailStatusEl)emailStatusEl.innerHTML=r.emailStatus==='concluido'?'<span class="status done">Concluído</span>':'<span class="status waiting">Pendente</span>';
      document.querySelector('#detailTasks').innerHTML = Object.entries(tasks).map(([task, completed]) => `<div class="task"><span>${taskName[task]}</span>${completed ? '<span class="status done">Preenchido</span>' : '<span class="status pending">Pendente</span>'}</div>`).join('');
      const events = [{ text: 'Registro criado.', date: r.createdAt }, ...(r.updates || [])].sort((a, b) => new Date(b.date) - new Date(a.date));
      document.querySelector('#timeline').innerHTML = events.map(e => `<div class="event"><time>${formatDate(e.date)}</time><p>${esc(e.text)}</p></div>`).join('');
      translatePage();
    }


    function fillOperationalProducts(){
      const familySelect=document.querySelector('#operationalFamilySelect'),productSelect=document.querySelector('#operationalProductSelect');
      const families=[...new Set(state.products.map(p=>p.family).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
      const currentFamily=familySelect.value||activeData()?.family||'';
      familySelect.innerHTML='<option value="">Não informado</option>'+families.map(f=>`<option value="${esc(f)}">${esc(f)}</option>`).join('');
      familySelect.value=families.includes(currentFamily)?currentFamily:'';
      const products=state.products.filter(p=>!familySelect.value||p.family===familySelect.value).sort((a,b)=>a.code.localeCompare(b.code));
      const currentProduct=productSelect.value||activeProduct||'';
      productSelect.innerHTML='<option value="">Não informado</option>'+products.map(p=>`<option value="${esc(p.code)}">${esc(p.code)} · ${esc(p.family)}</option>`).join('');
      productSelect.value=products.some(p=>p.code===currentProduct)?currentProduct:'';
    }
    function setOccurrenceMode(){document.querySelector('#occurrenceMode').value='UNIFICADA';}
    function previewOperationalEvidence(){
      const input=document.querySelector('#operationalEvidenceInput'),preview=document.querySelector('#operationalEvidencePreview'); if(!input||!preview)return;
      preview.innerHTML=''; [...(input.files||[])].filter(f=>f.type.startsWith('image/')).slice(0,8).forEach(file=>{const reader=new FileReader();reader.onload=e=>{const box=document.createElement('div');box.className='preview-thumb';box.innerHTML=`<img src="${e.target.result}" alt="Prévia da evidência">`;preview.appendChild(box);};reader.readAsDataURL(file);});
    }
    function openOperationalFailureModal(prefill={}){
      fillOperationalProducts();updateOwnerDropdowns();
      const ownerSelect=document.querySelector('#operationalOwnerSelect'); if(ownerSelect){ownerSelect.value=currentAccount?.name||'';ownerSelect.disabled=currentAccount?.role!=='admin';}
      const form=document.querySelector('#operationalFailureForm'); form.reset();
      form.elements.classification.value='NAO_DEFINIDO'; form.elements.classification_confidence.value='MEDIA';
      if(prefill.text)form.elements.issue.value=prefill.text; if(prefill.context)form.elements.description_context.value=prefill.context;
      if(prefill.classification)form.elements.classification.value=prefill.classification; if(prefill.component)form.elements.component.value=prefill.component; if(prefill.machine)form.elements.maquina.value=prefill.machine; if(prefill.station)form.elements.estacao.value=prefill.station; if(prefill.line)form.elements.linha.value=prefill.line; if(prefill.process)form.elements.processo.value=prefill.process; if(prefill.detectionMoment)form.elements.detection_moment.value=prefill.detectionMoment;
      document.querySelector('#operationalFailureModal').classList.remove('hidden'); form.elements.issue.focus(); translatePage();
    }
    function closeOperationalFailureModal(){document.querySelector('#operationalFailureModal').classList.add('hidden');document.querySelector('#operationalFailureForm').reset();document.querySelector('#operationalEvidencePreview').innerHTML='';setOccurrenceMode();}
    function openOperationalDetail(id){
      const r=state.operationalFailures.find(x=>x.id===id); if(!r)return; selectedOperationalId=id;
      document.querySelector('#opDetailTitle').textContent=`${r.id} · ${r.maquina||r.estacao||'Ocorrência operacional'}`;
      document.querySelector('#opDetailSubtitle').textContent=`${r.product||'Sem código'} · ${r.family||'Sem família'} · ${r.category||'Outro'} · ${r.linha||'Sem linha'}`;
      updateOwnerDropdowns();
      document.querySelector('#opDetailOwnerSelect').value=r.owner||'';
      document.querySelector('#opDetailOwnerSelect').disabled=currentAccount?.role !== 'admin';
      document.querySelector('#opDetailIssue').textContent=r.issue||'';
      document.querySelector('#opMachineInfo').innerHTML = `<strong>Classificação</strong>: ${esc(failureClassificationLabel(r.classification||'NAO_DEFINIDO'))} · Certeza: ${esc(r.classificationConfidence||'MEDIA')}<br><strong>Produto</strong>: ${esc(r.product||'Não informado')} · <strong>Componente</strong>: ${esc(r.component||r.peca_danificada||'Não informado')}<br><strong>Máquina</strong>: ${esc(r.maquina||'Não informada')} · <strong>Posto</strong>: ${esc(r.estacao||'Não informado')} · <strong>Linha</strong>: ${esc(r.linha||'Não informada')}<br><strong>Processo</strong>: ${esc(r.processo||'Não informado')} · <strong>Detectado</strong>: ${esc(r.detection_moment_label||r.detectionMoment||'Desconhecido')} · <strong>Onde</strong>: ${esc(r.onde_detectado||'Não informado')}`;
      document.querySelector('#opDetailEvidence').innerHTML=evidenceGallery(r.evidence,{allowDelete:true,kind:'operational',id:r.id});
      document.querySelector('#opDetailEvidencePreview').innerHTML='';
      document.querySelector('#opDetailCause').value=r.cause||'';
      document.querySelector('#opDetailAction').value=r.correctiveAction||'';
      document.querySelector('#opDetailStatus').value=operationalStatus(r);
      document.querySelector('#opDetailNotes').value=r.notes||'';
      document.querySelector('#opDetailEvidence').innerHTML=evidenceGallery(r.evidence,{allowDelete:true,kind:'operational',id:r.id});
      document.querySelector('#operationalDetailModal').classList.remove('hidden');
    }
    function closeOperationalDetail(){document.querySelector('#operationalDetailModal').classList.add('hidden');selectedOperationalId=null;}

    async function convertFailureToProductReport(failureId){
      const source=state.operationalFailures.find(r=>r.id===failureId);if(!source)return;
      if(String(source.classification||'').toUpperCase()!=='PRODUTO')return alert('Classifique a falha como Produto antes de transformá-la em Report.');
      const report={id:nextId('F'),tipo_falha:'PRODUTO',produtoConfirmado:true,emailStatus:'pendente',emailDraft:'',family:source.family||'',product:source.product||'',component:source.component||source.peca_danificada||'',material:source.material||'',issue:source.issue||'',owner:source.owner||currentAccount?.name||'',assignees:source.assignees||[],assignmentMode:source.assignmentMode||'private',teamShared:source.teamShared,evidence:source.evidence||[],status:'pendente',createdAt:now(),updates:[{text:`Convertido da Falha ${source.id}.`,date:now()}],detectionMoment:source.detectionMoment||'',originConfirmed:source.originConfirmed||''};
      await addDoc(collection(db,'reports'),report);
      await updateDoc(doc(db,'operationalFailures',source.docId),{convertedToReportId:report.id,convertedAt:now(),updates:[...(source.updates||[]),{text:`Convertido para Report de Produto ${report.id}.`,date:now()}]});
      showSaveToast(`Falha convertida em Report de Produto ${report.id}. E-mail pendente.`,'success');show('all');openDetail(report.id);
    }
    function nextId(prefix) {
      const list = prefix === 'F' ? state.reports : prefix === 'FO' ? state.operationalFailures : prefix === 'A' ? state.activities : state.flows;
      const max = list.reduce((n, item) => Math.max(n, Number((item.id.match(/(\d+)$/) || [0, 0])[1])), 0);
      return `${prefix}-${new Date().getFullYear()}-${String(max + 1).padStart(3, '0')}`;
    }

    document.querySelector('#languageSelect').value = currentLanguage;
    document.querySelector('#closeEvidenceLightbox').addEventListener('click', e => { e.stopPropagation(); closeEvidenceLightbox(); });
    document.querySelector('#evidenceLightbox').addEventListener('click', e => { if(e.target.id==='evidenceLightbox') closeEvidenceLightbox(); });
    document.addEventListener('keydown', e => { if(e.key==='Escape') closeEvidenceLightbox(); });
    document.addEventListener('click', async e => {
      const open=e.target.closest('[data-open-evidence]');
      if(open){ e.stopPropagation(); openEvidenceLightbox(open.dataset.openEvidence,open.dataset.evidenceName||'Evidência'); return; }
      const del=e.target.closest('[data-delete-evidence-kind]');
      if(del){ e.stopPropagation(); del.disabled=true; try{ await deleteEvidenceItem(del.dataset.deleteEvidenceKind,del.dataset.deleteEvidenceId,Number(del.dataset.deleteEvidenceIndex)); } catch(err){ console.error(err); alert('Não foi possível excluir a evidência.'); del.disabled=false; } }
    });

    document.querySelector('#languageSelect').addEventListener('change', e => {
      currentLanguage = e.target.value;
      localStorage.setItem(LANGUAGE_KEY, currentLanguage);
      dateFormat = new Intl.DateTimeFormat(currentLanguage, { dateStyle: 'short', timeStyle: 'short' });
      render();
      if (selectedId) renderDetail();
      if (selectedActivityId) renderActivityDetail();
      if (selectedFlowId) renderFlowDetail();
      translatePage();
    });

    document.querySelector('#globalSearch').addEventListener('input', e => {
      const val = e.target.value.toLowerCase().trim();
      if (!val) return;
      document.querySelector('#productSearch').value = val;
      document.querySelector('#allSearch').value = val;
      document.querySelector('#workSearch').value = val;
      document.querySelector('#flowSearch').value = val;
      renderProduct(); renderAll(); renderWork(); renderFlows();
    });

    document.querySelectorAll('.main-nav > button, .main-nav .nav-group-toggle').forEach(button => button.addEventListener('click', () => {
      const page = button.dataset.page;
      if (page === 'product' || page === 'operations') {
        const same = expandedSidebarSection === page;
        expandedSidebarSection = same ? '' : page;
        if (page === 'product') { expandedProductFamily = ''; expandedProductBase = ''; activeFamily = ''; localStorage.removeItem('central.sidebar.productFamily.v1'); localStorage.removeItem('central.sidebar.productBase.v1'); localStorage.removeItem('central.sidebar.productActiveFamily.v1'); }
        localStorage.setItem('central.sidebar.expanded.v1', expandedSidebarSection);
        if (!same) show(page); else { render(); }
        return;
      }
      show(page);
    }));
    document.addEventListener('click', e => {
      const familyToggle = e.target.closest('[data-family-toggle]');
      if (familyToggle) {
        e.preventDefault(); e.stopPropagation();
        const family = familyToggle.dataset.familyToggle || '';
        activeFamily = family;
        expandedProductFamily = family;
        expandedProductBase = '';
        localStorage.setItem('central.sidebar.productFamily.v1', expandedProductFamily);
        localStorage.removeItem('central.sidebar.productBase.v1');
        localStorage.setItem('central.sidebar.productActiveFamily.v1', activeFamily);
        show('all');
        return;
      }
      const baseToggle = e.target.closest('[data-base-family][data-base-code]');
      if (baseToggle) {
        e.preventDefault(); e.stopPropagation();
        const key = `${baseToggle.dataset.baseFamily || ''}::${baseToggle.dataset.baseCode || ''}`;
        const product = state.products.find(p => productFamily(p) === baseToggle.dataset.baseFamily && productBaseCode(p) === baseToggle.dataset.baseCode);
        if ((state.products.filter(p => productFamily(p) === baseToggle.dataset.baseFamily && productBaseCode(p) === baseToggle.dataset.baseCode).length || 0) <= 1) {
          if (product) { activeProduct = product.code; activeFamily = ''; localStorage.removeItem('central.sidebar.productActiveFamily.v1'); show('product'); }
          return;
        }
        expandedProductBase = expandedProductBase === key ? '' : key;
        localStorage.setItem('central.sidebar.productBase.v1', expandedProductBase);
        renderTree(); return;
      }
      const menuButton = e.target.closest('[data-family-menu]');
      if (menuButton) {
        e.preventDefault(); e.stopPropagation();
        const family = menuButton.dataset.familyMenu || '';
        document.querySelectorAll('.family-menu.open').forEach(x=>x.classList.remove('open'));
        const panel = document.querySelector(`[data-family-menu-panel="${CSS.escape(family)}"]`);
        panel?.classList.toggle('open'); return;
      }
      const rename = e.target.closest('[data-rename-family]');
      if (rename) { e.preventDefault(); e.stopPropagation(); document.querySelectorAll('.family-menu.open').forEach(x=>x.classList.remove('open')); requestRenameFamily(rename.dataset.renameFamily); return; }
      const del = e.target.closest('[data-delete-family]');
      if (del) { e.preventDefault(); e.stopPropagation(); document.querySelectorAll('.family-menu.open').forEach(x=>x.classList.remove('open')); openDeleteFamilyModal(del.dataset.deleteFamily); return; }
      if (!e.target.closest('.family-menu')) document.querySelectorAll('.family-menu.open').forEach(x=>x.classList.remove('open'));
    });
    // Um único listener delegado mantém os quatro indicadores confiáveis mesmo
    // quando o Dashboard é re-renderizado.
    document.addEventListener('click', e => {
      const card = e.target.closest('[data-dashboard-indicator]');
      if (!card || !document.querySelector('#dashboardView') || document.querySelector('#dashboardView').classList.contains('hidden')) return;
      openDashboardIndicator(card.dataset.dashboardIndicator);
    });
    document.addEventListener('keydown', e => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const card = e.target.closest('[data-dashboard-indicator]');
      if (!card) return;
      e.preventDefault();
      openDashboardIndicator(card.dataset.dashboardIndicator);
    });
    document.querySelector('#clearDashboardIndicator')?.addEventListener('click', clearDashboardIndicator);
    document.querySelector('#dashboardIndicatorModal')?.addEventListener('click',e=>{if(e.target.id==='dashboardIndicatorModal')e.currentTarget.classList.add('hidden');});

    document.querySelector('#newProduct')?.addEventListener('click', openProductModal);
    document.querySelector('#headerNewProduct').addEventListener('click', openProductModal);
    document.querySelector('#newComponent').addEventListener('click', () => openComponentModal());
    document.querySelector('#newFailure').addEventListener('click', openFailureModal);
    document.querySelector('#newOperationalFailure').addEventListener('click', () => openOperationalFailureModal());
    document.querySelector('#headerNewOperationalFailure').addEventListener('click', openOperationalFailureModal);
    document.querySelector('#operationalEvidenceInput').addEventListener('change', previewOperationalEvidence);

    document.querySelector('#operationalFamilySelect').addEventListener('change', () => {
      const family=document.querySelector('#operationalFamilySelect').value;
      const productSelect=document.querySelector('#operationalProductSelect');
      const products=state.products.filter(p=>!family || p.family===family).sort((a,b)=>a.code.localeCompare(b.code));
      productSelect.innerHTML='<option value="">Selecione</option>'+products.map(p=>`<option value="${esc(p.code)}">${esc(p.code)} · ${esc(p.family)}</option>`).join('');
      if(products.length===1) productSelect.value=products[0].code;
    });
    document.querySelector('#quickOperationalFailure').addEventListener('click', () => openOperationalFailureModal());
    document.querySelector('#newActivity').addEventListener('click', openActivityModal);
    document.querySelector('#newFlow').addEventListener('click', openFlowModal);
    document.querySelector('#quickActivity').addEventListener('click', openActivityModal);
    document.querySelector('#quickFailure').addEventListener('click', () => { show('product'); openFailureModal(); });
    document.querySelector('#quickFlow').addEventListener('click', openFlowModal);
    document.querySelector('#allReports').addEventListener('click', () => { activeFamily=''; localStorage.removeItem('central.sidebar.productActiveFamily.v1'); show('all'); });
    document.querySelector('#changeAccount').addEventListener('click', async () => {
      await signOut(auth);
      showAuthScreen('login');
    });

    
    document.querySelectorAll('.central-switch-btn').forEach(btn => {
      btn.addEventListener('click', () => { homeCentralMode = btn.dataset.centralMode || 'mine'; setHomeCentralMode(); });
    });

    document.querySelector('#enableResponseLink').addEventListener('change', e => {
      document.querySelector('#responseLinkField').classList.toggle('hidden', !e.target.checked);
      if (e.target.checked) document.querySelector('#detailResponseLink').focus();
      else document.querySelector('#detailResponseLink').value = '';
    });

    document.querySelectorAll('#homeView .stat').forEach((card, index) => {
      card.setAttribute('role','button'); card.setAttribute('tabindex','0');
      const go = () => {
        if (index === 0) { homeCentralMode='mine'; show('home'); setHomeCentralMode(); }
        if (index === 1) { show('all'); document.querySelector('#allStatus').value='pendente'; renderAll(); }
        if (index === 2) { show('work'); }
        if (index === 3) { homeCentralMode='mine'; show('home'); setHomeCentralMode(); const el=document.querySelector('[data-priority="waiting"]'); if(el) el.scrollIntoView({behavior:'smooth',block:'center'}); }
      };
      card.addEventListener('click', go);
      card.addEventListener('keydown', e => { if(e.key==='Enter' || e.key===' ') { e.preventDefault(); go(); }});
    });

    document.querySelector('#teamCentralPanels').addEventListener('click', async e => {
      const claim=e.target.closest('[data-claim-kind]');
      if(claim){
        e.stopPropagation(); claim.disabled=true; claim.textContent='Assumindo...';
        try{ await claimOpenTask(claim.dataset.claimKind,claim.dataset.claimId); render(); }
        catch(err){ console.error(err); claim.disabled=false; claim.textContent='Assumir tarefa'; alert('Não foi possível assumir a tarefa.'); }
        return;
      }
      const request=e.target.closest('[data-request-kind]');
      if(request){
        e.stopPropagation(); request.disabled=true; request.textContent='Enviando...';
        try{ await requestParticipation(request.dataset.requestKind,request.dataset.requestId); render(); }
        catch(err){ console.error(err); request.disabled=false; request.textContent='Pedir para participar'; alert('Não foi possível enviar a solicitação.'); }
        return;
      }
      const approve=e.target.closest('[data-approve-kind]');
      if(approve){
        e.stopPropagation();
        try{ await respondParticipation(approve.dataset.approveKind,approve.dataset.approveId,approve.dataset.requester,true); render(); }
        catch(err){ console.error(err); alert('Não foi possível autorizar a participação.'); }
        return;
      }
      const row=e.target.closest('[data-kind][data-ref]');
      if(!row) return;
      const kind=row.dataset.kind,id=row.dataset.ref;
      if(kind==='activity') return openActivityDetail(id);
      if(kind==='flow') return openFlowDetail(id);
      if(kind==='report') return openDetail(id);
      if(kind==='operational') return openOperationalDetail(id);
    });

    document.querySelector('#participationRequestsPanel').addEventListener('click', async e => {
      const approve=e.target.closest('[data-approve-kind]');
      const deny=e.target.closest('[data-deny-kind]');
      try{
        if(approve){ await respondParticipation(approve.dataset.approveKind,approve.dataset.approveId,approve.dataset.requester,true); render(); return; }
        if(deny){ await respondParticipation(deny.dataset.denyKind,deny.dataset.denyId,deny.dataset.requester,false); render(); return; }
      }catch(err){ console.error(err); alert('Não foi possível atualizar a solicitação.'); }
    });

    ['workSearch','workProduct','workOwner','workStatus'].forEach(id => document.querySelector('#'+id).addEventListener(id==='workSearch' ? 'input' : 'change', renderWork));
    ['flowSearch','flowProductFilter','flowOwner','flowStatus'].forEach(id => document.querySelector('#'+id).addEventListener(id==='flowSearch' ? 'input' : 'change', renderFlows));

document.querySelectorAll('.product-tab').forEach(btn => {
      btn.addEventListener('click', (e) => {
        document.querySelectorAll('.product-tab').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
        e.target.classList.add('active');
        document.querySelector(`#tab-${e.target.dataset.tab}`).classList.remove('hidden');
      });
    });

    document.querySelectorAll('.close-confirm').forEach(b => b.addEventListener('click', closeConfirmModal));
    document.querySelector('#btnConfirmDelete').addEventListener('click', confirmDeleteFamily);
    document.querySelectorAll('.close-product').forEach(b => b.addEventListener('click', closeProductModal));
    document.querySelector('#productForm [name="baseCode"]')?.addEventListener('input', updateProductCodePreview);
    document.querySelector('#productForm [name="color"]')?.addEventListener('input', updateProductCodePreview);
    document.querySelector('#productFamilySelect')?.addEventListener('change', syncProductFamilyInput);
    document.querySelector('#productNewFamily')?.addEventListener('input', e => { e.target.value = e.target.value.replace(/^\s+/, ''); });
    document.querySelectorAll('.close-family-rename').forEach(b => b.addEventListener('click', closeFamilyRenameModal));
    document.querySelector('#familyRenameForm')?.addEventListener('submit', async e => { e.preventDefault(); await renameFamily(new FormData(e.currentTarget).get('newFamilyName')); });
    document.querySelectorAll('.close-component').forEach(b => b.addEventListener('click', closeComponentModal));
    document.querySelectorAll('.close-failure').forEach(b => b.addEventListener('click', closeFailureModal));
    document.querySelectorAll('.close-activity').forEach(b => b.addEventListener('click', closeActivityModal));
    document.querySelectorAll('.close-flow').forEach(b => b.addEventListener('click', closeFlowModal));
    document.querySelectorAll('.close-operational').forEach(b => b.addEventListener('click', closeOperationalFailureModal));
    document.querySelector('.close-detail').addEventListener('click', closeDetail);
    document.querySelector('.close-operational-detail').addEventListener('click', closeOperationalDetail);
    document.querySelector('.close-activity-detail').addEventListener('click', closeActivityDetail);
    document.querySelector('.close-flow-detail').addEventListener('click', closeFlowDetail);

    document.querySelector('#productForm').addEventListener('submit', async e => {
      e.preventDefault();
      const f = new FormData(e.currentTarget);
      const selectedFamily = String(f.get('familySelect') || '').trim();
      const newFamilyName = String(f.get('newFamilyName') || '').trim();
      const family = selectedFamily === '__NEW__' ? newFamilyName : selectedFamily;
      const commercialName = String(f.get('commercialName') || '').trim();
      const baseCode = String(f.get('baseCode') || '').trim();
      const color = String(f.get('color') || '').trim().toUpperCase();
      const code = (baseCode + color).trim();
      if (!family || !baseCode || !code) { alert('Selecione uma família existente ou crie uma nova família, e informe o código-base.'); return; }
      if (!selectedFamily && !newFamilyName) { alert('Selecione uma família existente ou crie uma nova família.'); return; }
      if (state.products.some(p => p.code.toLowerCase() === code.toLowerCase())) {
        alert('Este produto/variante já está cadastrado.'); return;
      }
      await addDoc(collection(db, "products"), { code, baseCode, color, family, commercialName, components: [], variantType: color ? 'cor' : 'base', createdAt: now() });
      activeProduct = code;
      closeProductModal();
      show('product');
    });

    document.querySelector('#componentForm').addEventListener('submit', async e => {
      e.preventDefault();
      const name = new FormData(e.currentTarget).get('name').trim(), product = activeData();
      if (!product) return;
      if ((product.components || []).some(c => c.toLowerCase() === name.toLowerCase())) {
        alert('Este componente já está cadastrado para este produto.'); return;
      }
      const updatedComponents = [...(product.components || []), name];
      await updateDoc(doc(db, "products", product.docId), { components: updatedComponents });
      const shouldOpenFailure = continueToFailureAfterComponent;
      closeComponentModal();
      if (shouldOpenFailure) openFailureModal();
    });

    document.querySelector('#failureForm').addEventListener('submit', async e => {
      e.preventDefault();
      const form = e.currentTarget;
      const saveButton = form.querySelector('button.button.primary');
      if (saveButton) { saveButton.disabled = true; saveButton.textContent = 'Salvando...'; }
      try {
        const f = new FormData(form);
        const p = activeData();
        if (!p) { showSaveToast('ERRO ao salvar: produto não encontrado.','error'); return; }
        const component = String(f.get('component') || '').trim();
        const issue = String(f.get('issue') || '').trim();
        if (!component) { showSaveToast('ERRO ao salvar: selecione o componente.','error'); return; }
        if (!issue) { showSaveToast('ERRO ao salvar: descreva a falha.','error'); return; }

        const evidence = await readAttachments(form.elements.evidence.files);
        const assignment = assignmentPayload(form, currentAccount?.name);
        const report = {
          id: nextId('F'),
          tipo_falha: 'PRODUTO',
          produtoConfirmado: true,
          emailStatus: 'pendente',
          emailDraft: '',
          product: p.code,
          family: p.family,
          component,
          maquina: '',
          linha: '',
          material: String(f.get('material') || '').trim(),
          supplier: 'Fornecedor Padrão',
          owner: assignment.owner,
          assignees: assignment.assignees,
          assignmentMode: assignment.assignmentMode,
          teamShared: assignment.teamShared,
          issue,
          detectionMoment: String(f.get('detection_moment') || '').trim(),
          originConfirmed: String(f.get('origin_confirmed') || '').trim(),
          reportLink: String(f.get('reportLink') || '').trim(),
          responseLink: '',
          evidence,
          createdAt: now(),
          updates: []
        };

        if(!navigator.onLine){const localId=`offline-${Date.now()}`;report.docId=localId;await queueOfflineWrite('reports',report);state.reports=[...state.reports,report];showSaveToast('Sem conexão. Report salvo no dispositivo e aguardará sincronização.','success');} else { await addDoc(collection(db, "reports"), report); }
        closeFailureModal();
        show('product');
        openDetail(report.id);
        showSaveToast('REPORT DE PRODUTO SALVO','success');
      } catch (err) {
        console.error('[Central] Erro ao cadastrar falha:', err);
        showSaveToast(`ERRO ao salvar: ${err?.message || 'não foi possível salvar.'}`,'error');
      } finally {
        if (saveButton) { saveButton.disabled = false; saveButton.textContent = 'Salvar falha'; }
      }
    });

    document.querySelector('#operationalFailureForm').addEventListener('submit', async e => {
      e.preventDefault();
      const form=e.currentTarget;const f=new FormData(form);
      const assignment=assignmentPayload(form,String(f.get('owner')||'').trim());
      const productCode=String(f.get('product')||'').trim();const product=state.products.find(p=>p.code===productCode);
      const rawQty=String(f.get('quantidade_afetada')||'').trim();const evidence=await readAttachments(f.getAll('evidence').filter(Boolean));
      const classification=String(f.get('classification')||'NAO_DEFINIDO').toUpperCase();const detectionMoment=String(f.get('detection_moment')||'DESCONHECIDO');
      const detectionLabels={DESCONHECIDO:'Desconhecido',ANTES_MONTAGEM:'Antes da montagem',DURANTE_MONTAGEM:'Durante a montagem',APOS_MONTAGEM:'Após a montagem',TESTE:'No teste',INSPECAO:'Na inspeção',RETRABALHO:'No retrabalho',ENTRADA_LINHA:'Na entrada da linha',OUTRO:'Outro'};
      const issue=String(f.get('issue')||'').trim();if(!issue)return alert('Descreva a falha antes de salvar.');
      const item={
        id:nextId('FO'),family:String(f.get('family')||product?.family||'').trim(),product:productCode,component:String(f.get('component')||'').trim(),material:String(f.get('material')||'').trim(),
        occurrenceMode:'UNIFICADA',classification,classificationConfidence:String(f.get('classification_confidence')||'MEDIA'),category:classification,categoryLabel:String(f.get('category_label')||'').trim(),
        maquina:String(f.get('maquina')||'').trim(),linha:String(f.get('linha')||'').trim(),estacao:String(f.get('estacao')||'').trim(),processo:String(f.get('processo')||'').trim(),peca_danificada:String(f.get('component')||'').trim(),
        detectionMoment,detection_moment_label:detectionLabels[detectionMoment]||detectionMoment,quando_inicio:f.get('quando_inicio')||'',onde_detectado:String(f.get('onde_detectado')||'').trim(),quantity:rawQty===''?null:Number(rawQty),
        issue,descriptionContext:String(f.get('description_context')||'').trim(),hypothesis:String(f.get('hipotese_causa')||'').trim(),tests:String(f.get('testes_realizados')||'').trim(),cause:String(f.get('causa_confirmada')||'').trim(),correctiveAction:String(f.get('acao_corretiva')||'').trim(),notes:String(f.get('observacoes')||'').trim(),
        owner:assignment.owner||'Usuário Desconhecido',assignees:assignment.assignees,assignmentMode:assignment.assignmentMode,teamShared:assignment.teamShared,evidence,status:'pendente',createdAt:now(),updates:[]
      };
      if(!navigator.onLine){item.docId=`offline-${Date.now()}`;await queueOfflineWrite('operationalFailures',item);state.operationalFailures=[...state.operationalFailures,item];showSaveToast('Sem conexão. Falha salva no dispositivo e aguardará sincronização.','success');}else{item.docId=(await addDoc(collection(db,'operationalFailures'),item)).id;}
      closeOperationalFailureModal();show('operations');openOperationalDetail(item.id);
    });

    document.querySelector('#activityForm').addEventListener('submit', async e => {
      e.preventDefault();
      const formElement = e.currentTarget;
      const form = new FormData(formElement);
      const assignment = assignmentPayload(formElement, form.get('owner'));
      const activity = {
        id: nextId('A'),
        title: form.get('title').trim(),
        type: form.get('type'),
        area: form.get('area').trim(),
        owner: assignment.owner,
        assignees: assignment.assignees,
        assignmentMode: assignment.assignmentMode,
        teamShared: assignment.teamShared,
        openedBy: currentAccount?.name || form.get('owner'),
        dueDate: form.get('dueDate'),
        description: form.get('description').trim(),
        link: form.get('link').trim(),
        status: 'pendente',
        product: form.get('product') || activeProduct || '',
        createdAt: now(),
        updates: []
      };
      await addDoc(collection(db, "activities"), activity);
      closeActivityModal();
      show('work');
      openActivityDetail(activity.id);
    });

    document.querySelector('#convertOperationalToProductReport')?.addEventListener('click', () => { if(selectedOperationalId) convertFailureToProductReport(selectedOperationalId); });
    document.querySelector('#saveOperationalEvidence').addEventListener('click', async () => {
      const r = state.operationalFailures.find(x => x.id === selectedOperationalId);
      if (!r) return;
      const input = document.querySelector('#opDetailEvidenceInput');
      const newFiles = await readAttachments(input.files);
      if(!newFiles.length) return alert('Selecione pelo menos uma evidência.');
      const evidence = [...evidenceEntries(r.evidence), ...newFiles];
      await updateDoc(doc(db, 'operationalFailures', r.docId), {
        evidence,
        updates: [...(r.updates || []), { text: `${newFiles.length} evidência(s) adicionada(s).`, date: now() }]
      });
      input.value = '';
      document.querySelector('#opDetailEvidencePreview').innerHTML='';
      openOperationalDetail(r.id);
    });
    document.querySelector('#opDetailEvidenceInput').addEventListener('change', () => {
      const input=document.querySelector('#opDetailEvidenceInput');
      const preview=document.querySelector('#opDetailEvidencePreview');
      preview.innerHTML='';
      [...(input.files||[])].filter(f=>f.type.startsWith('image/')).slice(0,8).forEach(file=>{
        const reader=new FileReader();
        reader.onload=e=>{
          const box=document.createElement('div');
          box.className='preview-thumb';
          box.innerHTML=`<img src="${e.target.result}" alt="Prévia da evidência">`;
          preview.appendChild(box);
        };
        reader.readAsDataURL(file);
      });
    });

    document.querySelector('#saveOperationalDetail').addEventListener('click', async () => {
      const r = state.operationalFailures.find(x => x.id === selectedOperationalId);
      if (!r) return;
      const cause = document.querySelector('#opDetailCause').value.trim();
      const action = document.querySelector('#opDetailAction').value.trim();
      const notes = document.querySelector('#opDetailNotes').value.trim();
      const status = document.querySelector('#opDetailStatus').value;
      const owner = document.querySelector('#opDetailOwnerSelect').value;
      if(currentAccount?.role !== 'admin' && owner !== r.owner){ alert('Apenas administradores podem alterar o responsável.'); return; }
      const changes=[];
      if(owner !== r.owner) changes.push(`Responsável alterado para ${owner || 'não definido'}.`);
      if(status !== r.status) changes.push(`Status alterado para ${status}.`);
      if(cause !== (r.cause||'') || action !== (r.correctiveAction||'') || notes !== (r.notes||'')) changes.push('Registro operacional atualizado.');
      const updates = changes.length ? [...(r.updates || []), { text: changes.join(' '), date: now() }] : (r.updates || []);
      await updateDoc(doc(db, 'operationalFailures', r.docId), { cause, correctiveAction: action, notes, status, owner, updates });
      renderOperations(); closeOperationalDetail();
    });

    document.querySelector('#deleteOperationalDetail').addEventListener('click', async () => {
      const r = state.operationalFailures.find(x => x.id === selectedOperationalId);
      if (!r) return;
      if (!confirm(`Excluir a ocorrência ${r.id}? Esta ação não pode ser desfeita.`)) return;
      await deleteDoc(doc(db, 'operationalFailures', r.docId));
      closeOperationalDetail(); renderOperations();
    });

    document.querySelector('#flowForm').addEventListener('submit', async e => {
      e.preventDefault();
      const form = new FormData(e.currentTarget), fileInput = e.currentTarget.elements.formAttachment;
      const flow = {
        id: nextId('FL'),
        product: form.get('product'),
        scope: form.get('scope'),
        creator: currentAccount?.name || 'Usuário não identificado',
        followUpOwner: form.get('followUpOwner'),
        description: form.get('description').trim(),
        formAttachment: await readAttachments(fileInput.files),
        emailLink: form.get('emailLink').trim(),
        coverLink: '',
        followUpLink: '',
        createdAt: now(),
        updates: []
      };
      await addDoc(collection(db, "flows"), flow);
      closeFlowModal();
      show('flow');
      openFlowDetail(flow.id);
    });

    document.querySelector('#productTree').addEventListener('click', e => {
      const renameBtn = e.target.closest('[data-rename-family]');
      if (renameBtn) { e.stopPropagation(); requestRenameFamily(renameBtn.dataset.renameFamily); return; }
      const deleteBtn = e.target.closest('[data-delete-family]');
      if (deleteBtn) { e.stopPropagation(); requestDeleteFamily(deleteBtn.dataset.deleteFamily); return; }
      const btn = e.target.closest('[data-product]');
      if (!btn) return;
      activeProduct = btn.dataset.product;
      activeFamily = '';
      localStorage.removeItem('central.sidebar.productActiveFamily.v1');
      show('product');
    });

    document.addEventListener('click', e => {
      const productRow = e.target.closest('tr[data-id]'), productItem = e.target.closest('[data-id]'), activityRow = e.target.closest('[data-activity]'), flowRow = e.target.closest('[data-flow]');
      if (activityRow) return openActivityDetail(activityRow.dataset.activity);
      if (flowRow) return openFlowDetail(flowRow.dataset.flow);
      if (productRow) return openDetail(productRow.dataset.id);
      if (productItem) return openDetail(productItem.dataset.id);
    });

    ['productSearch', 'componentFilter', 'productStatus'].forEach(id => document.querySelector('#' + id).addEventListener(id === 'productSearch' ? 'input' : 'change', renderProduct));
    ['allSearch', 'allFamily', 'allComponent', 'allStatus'].forEach(id => document.querySelector('#' + id).addEventListener(id === 'allSearch' ? 'input' : 'change', renderAll));
    ['workSearch', 'workOwner', 'workStatus'].forEach(id => document.querySelector('#' + id).addEventListener(id === 'workSearch' ? 'input' : 'change', renderWork));
    ['flowSearch', 'flowOwner', 'flowStatus'].forEach(id => document.querySelector('#' + id).addEventListener(id === 'flowSearch' ? 'input' : 'change', renderFlows));

    function showSaveToast(message, type='success'){
      const toast=document.querySelector('#saveToast');
      if(!toast)return;
      toast.textContent=message;
      toast.className=`save-toast show ${type}`;
      clearTimeout(window.__saveToastTimer);
      window.__saveToastTimer=setTimeout(()=>toast.className='save-toast',2200);
    }

    function detailAnalysisFromForm(){
      return {
        problem: document.querySelector('#analysisProblem').value.trim(),
        where: document.querySelector('#analysisWhere').value.trim(),
        when: document.querySelector('#analysisWhen').value || '',
        affected: document.querySelector('#analysisAffected').value === '' ? '' : Number(document.querySelector('#analysisAffected').value),
        hypothesis: document.querySelector('#analysisHypothesis').value.trim(),
        tests: document.querySelector('#analysisTests').value.trim(),
        cause: document.querySelector('#analysisCause').value.trim(),
        action: document.querySelector('#analysisAction').value.trim(),
        notes: document.querySelector('#analysisNotes').value.trim()
      };
    }

    async function saveReportDetails({includeFiles=false, closeEditor=false, toast=true}={}){
      const r=selected();
      if(!r){if(toast)showSaveToast('ERRO ao salvar: falha não encontrada.','error');return false;}
      const reportLink=document.querySelector('#detailReportLink').value.trim();
      const responseEnabled=document.querySelector('#enableResponseLink').checked;
      const responseLink=responseEnabled ? document.querySelector('#detailResponseLink').value.trim() : '';
      const issueInput=document.querySelector('#failureNameInput');
      const issue=issueInput ? issueInput.value.trim() : (r.issue||'');
      if(!issue){if(toast)showSaveToast('ERRO ao salvar: informe o nome da falha.','error');return false;}

      let updatedEvidence=evidenceEntries(r.evidence),newFiles=[];
      if(includeFiles){
        newFiles=await readAttachments(document.querySelector('#detailEvidenceInput').files);
        if(newFiles.length)updatedEvidence=[...updatedEvidence,...newFiles];
      }

      const analysis=detailAnalysisFromForm();
      const rawQuantity=document.querySelector('#detailQuantity').value;
      const quantity=rawQuantity===''?null:Number(rawQuantity);
      const quantityPeriod=document.querySelector('#detailQuantityPeriod').value.trim();
      const quantityNotes=document.querySelector('#detailQuantityNotes').value.trim();
      const changes=[];
      if(issue!==(r.issue||''))changes.push('Descrição da falha atualizada.');
      if(reportLink!==(r.reportLink||''))changes.push(reportLink?'Link do report atualizado.':'Link do report removido.');
      if(responseLink!==(r.responseLink||''))changes.push(responseLink?'Link da resposta atualizado.':'Link da resposta removido.');
      if(newFiles.length)changes.push(`${newFiles.length} evidência(s) adicionada(s).`);
      if(JSON.stringify(analysis)!==JSON.stringify(r.analysis||{}))changes.push('Análise atualizada.');
      if(quantity!==(r.quantity??null)||quantityPeriod!==(r.quantityPeriod||'')||quantityNotes!==(r.quantityNotes||''))changes.push('Quantidade acumulada atualizada.');

      const payload={issue,reportLink,responseLink,evidence:updatedEvidence,analysis,quantity,quantityPeriod,quantityNotes};
      if(quantity!==(r.quantity??null)){
        payload.quantityHistory=[...(r.quantityHistory||[]),{date:now(),from:r.quantity??0,to:quantity??0,delta:(quantity??0)-(r.quantity??0),period:quantityPeriod,notes:quantityNotes}];
      }else payload.quantityHistory=r.quantityHistory||[];
      if(changes.length)payload.updates=[...(r.updates||[]),{text:changes.join(' '),date:now()}];

      try{
        await updateDoc(doc(db,'reports',r.docId),payload);
        document.querySelector('#detailEvidenceInput').value='';
        if(closeEditor)document.querySelector('#failureNameEditor')?.classList.add('hidden');
        renderDetail();
        if(toast)showSaveToast('SALVO','success');
        return true;
      }catch(err){
        console.error('[Central] Erro ao salvar falha:',err);
        if(toast)showSaveToast(`ERRO ao salvar: ${err?.message||'não foi possível salvar.'}`,'error');
        return false;
      }
    }

    document.querySelector('#saveArtifacts').addEventListener('click',async()=>{await saveReportDetails({includeFiles:true});});
    document.querySelector('#saveAnalysis').addEventListener('click',async()=>{await saveReportDetails();});
    document.querySelector('#saveQuantity').addEventListener('click',async()=>{await saveReportDetails();});
    document.querySelector('#saveDetailPage').addEventListener('click',async()=>{await saveReportDetails({includeFiles:true,closeEditor:true});});

    document.querySelector('#editFailureName').addEventListener('click',()=>{
      const r=selected();if(!r)return;
      document.querySelector('#failureNameInput').value=r.issue||'';
      document.querySelector('#failureNameEditor').classList.remove('hidden');
      document.querySelector('#failureNameInput').focus();
    });
    document.querySelector('#cancelFailureName').addEventListener('click',()=>document.querySelector('#failureNameEditor').classList.add('hidden'));
    document.querySelector('#saveFailureName').addEventListener('click',async()=>{await saveReportDetails({closeEditor:true});});
    document.querySelector('#failureNameInput').addEventListener('keydown',e=>{
      if((e.ctrlKey||e.metaKey)&&e.key==='Enter'){
        e.preventDefault();
        document.querySelector('#saveFailureName').click();
      }
    });


    document.querySelector('#generateAnalysisSummary').addEventListener('click',()=>{
      const r=selected();if(!r){showSaveToast('ERRO: falha não encontrada.','error');return;}
      const preview={...r,issue:document.querySelector('#failureNameInput')?.value.trim()||r.issue,analysis:detailAnalysisFromForm()};
      const rawQuantity=document.querySelector('#detailQuantity').value;
      preview.quantity=rawQuantity===''?null:Number(rawQuantity);
      preview.quantityPeriod=document.querySelector('#detailQuantityPeriod').value.trim();
      const output=document.querySelector('#generatedOutput');
      output.textContent=generateAnalysisText(preview)||'Nenhum dado de análise preenchido.';
      output.classList.remove('hidden');
      showSaveToast('RESUMO GERADO','success');
    });

    document.querySelector('#addUpdate').addEventListener('click', async () => {
      const input = document.querySelector('#updateInput'), text = input.value.trim();
      if (!text) return input.focus();
      const r = selected(); if (!r) return;
      const updates = [...(r.updates || []), { text, date: now() }];
      await updateDoc(doc(db, "reports", r.docId), { updates });
      input.value = '';
      renderDetail();
    });

    document.querySelector('#deleteReport').addEventListener('click', async () => {
      if (currentAccount?.role !== 'admin') { alert('Apenas administradores podem excluir registros.'); return; }
      const r = selected();
      if (!r || !confirm(`Excluir ${r.id}? Esta ação não pode ser desfeita.`)) return;
      await deleteDoc(doc(db, "reports", r.docId));
      closeDetail();
    });

    document.querySelector('#editActivityDescription').addEventListener('click', () => {
      const activity = selectedActivity(); if (!activity) return;
      document.querySelector('#activityDetailDescriptionInput').value = activity.description || '';
      document.querySelector('#activityDescriptionEditor').classList.remove('hidden');
      document.querySelector('#activityDetailDescription').classList.add('hidden');
      document.querySelector('#activityDetailDescriptionInput').focus();
    });

    document.querySelector('#cancelActivityDescription').addEventListener('click', () => {
      document.querySelector('#activityDescriptionEditor').classList.add('hidden');
      document.querySelector('#activityDetailDescription').classList.remove('hidden');
    });

    document.querySelector('#saveActivityDescription').addEventListener('click', async () => {
      const activity = selectedActivity(); if (!activity) return;
      const description = document.querySelector('#activityDetailDescriptionInput').value.trim();
      if (!description) return alert('A descrição não pode ficar vazia.');
      if (description === (activity.description || '')) return renderActivityDetail();
      const updates = [...(activity.updates || []), { text: 'Descrição da atividade alterada.', date: now() }];
      await updateDoc(doc(db, 'activities', activity.docId), { description, updates });
      renderActivityDetail();
    });

    document.querySelector('#saveActivityChanges').addEventListener('click', async () => {
      const activity = selectedActivity(); if (!activity) return;
      const status = document.querySelector('#activityDetailStatus').value;
      const dueDate = document.querySelector('#activityDetailDue').value;
      const changes = [];
      
      if (status !== activity.status) changes.push(`Status alterado para “${activityStatusName[status]}”.`);
      if (dueDate !== activity.dueDate) changes.push(dueDate ? `Prazo atualizado para ${formatDate(dueDate)}.` : 'Prazo removido.');
      
      if (!changes.length) return;
      const updates = [...(activity.updates || []), { text: changes.join(' '), date: now() }];
      await updateDoc(doc(db, "activities", activity.docId), { status, dueDate, updates });
      renderActivityDetail();
    });

    document.querySelector('#addActivityUpdate').addEventListener('click', async () => {
      const input = document.querySelector('#activityUpdateInput'), text = input.value.trim();
      if (!text) return input.focus();
      const activity = selectedActivity(); if (!activity) return;
      const updates = [...(activity.updates || []), { text, date: now() }];
      await updateDoc(doc(db, "activities", activity.docId), { updates });
      input.value = '';
      renderActivityDetail();
    });

    document.querySelector('#deleteActivity').addEventListener('click', async () => {
      if (currentAccount?.role !== 'admin') { alert('Apenas administradores podem excluir atividades.'); return; }
      const activity = selectedActivity();
      if (!activity || !confirm(`Excluir ${activity.id}? Essa ação não pode ser desfeita.`)) return;
      await deleteDoc(doc(db, "activities", activity.docId));
      closeActivityDetail();
    });

    document.querySelector('#saveFlowChanges').addEventListener('click', async () => {
      const flow = selectedFlow(); if (!flow) return;
      const emailLink = document.querySelector('#flowDetailEmailLink').value.trim();
      const coverLink = document.querySelector('#flowDetailCoverLink').value.trim();
      const followUpLink = document.querySelector('#flowDetailFollowUpLink').value.trim();
      const followUpOwner = document.querySelector('#flowDetailOwnerSelect').value;
      const newFiles = await readAttachments(document.querySelector('#flowDetailAttachment').files);
      const changes = [];

      let updatedFormAttachment = evidenceEntries(flow.formAttachment);
      if (emailLink !== flow.emailLink) changes.push(emailLink ? 'Link do e-mail atualizado.' : 'Link do e-mail removido.');
      if (coverLink !== flow.coverLink) changes.push(coverLink ? 'Link da folha de rosto atualizado.' : 'Link da folha de rosto removido.');
      if (followUpLink !== flow.followUpLink) changes.push(followUpLink ? 'Link de seguimento atualizado.' : 'Link de seguimento removido.');
      if (followUpOwner !== flow.followUpOwner) changes.push(`Responsável alterado para ${followUpOwner}.`);
      if (newFiles.length) { updatedFormAttachment = [...updatedFormAttachment, ...newFiles]; changes.push(`${newFiles.length} arquivo(s) adicionado(s).`); }

      if (!changes.length) return;
      const updates = [...(flow.updates || []), { text: changes.join(' '), date: now() }];
      await updateDoc(doc(db, "flows", flow.docId), { 
        emailLink, coverLink, followUpLink, followUpOwner, formAttachment: updatedFormAttachment, updates 
      });
      renderFlowDetail();
    });

    document.querySelector('#deleteFlow').addEventListener('click', async () => {
      if (currentAccount?.role !== 'admin') { alert('Apenas administradores podem excluir fluxos.'); return; }
      const flow = selectedFlow();
      if (!flow || !confirm(`Excluir fluxo ${flow.id}? Esta ação não pode ser desfeita.`)) return;
      await deleteDoc(doc(db, "flows", flow.docId));
      closeFlowDetail();
    });

    setOccurrenceMode('MAQUINA');

    // A autenticação inicializa a sincronização; o observer do Firebase controla a sessão.
    render();
  
    /* V14.12 — melhorias de operação sem tocar no Firebase/Auth */
    function aiSetUploadProgress(value,label='Lendo anexos…'){
      const wrap=document.querySelector('#aiUploadProgressWrap'),bar=document.querySelector('#aiUploadProgress'),txt=document.querySelector('#aiUploadProgressLabel');
      if(!wrap||!bar)return;
      wrap.classList.toggle('hidden',value>=100||value<=0);
      bar.value=Math.max(0,Math.min(100,value)); if(txt)txt.textContent=label;
      if(value>=100)setTimeout(()=>wrap.classList.add('hidden'),450);
    }
    const _aiReadImagesOriginal=aiReadImages;
    aiReadImages=async function(files){
      const arr=[...files].filter(f=>f.type.startsWith('image/')).slice(0,6);
      aiSetUploadProgress(1,`Lendo ${arr.length} imagem(ns)…`);
      for(let i=0;i<arr.length;i++){
        const file=arr[i];
        const data=await new Promise((resolve,reject)=>{const fr=new FileReader();fr.onload=()=>resolve(fr.result);fr.onerror=reject;fr.readAsDataURL(file);});
        aiPilot.images.push({name:file.name,type:file.type,dataUrl:data});
        aiSetUploadProgress(Math.round(((i+1)/Math.max(1,arr.length))*100),`Imagem ${i+1}/${arr.length}`);
      }
      aiRenderAttachments();aiUpdateAIState();aiSetUploadProgress(100,'Anexos prontos');
    };
    const _aiReadFilesOriginal=aiReadFiles;
    aiReadFiles=async function(files){
      const arr=[...files].slice(0,8);
      aiSetUploadProgress(1,`Lendo ${arr.length} arquivo(s)…`);
      for(let i=0;i<arr.length;i++){
        const file=arr[i];
        const parsed=await aiParseDataFile(file);
        aiPilot.dataFiles.push({name:file.name,type:file.type,rows:parsed.rows,columns:parsed.columns});
        aiSetUploadProgress(Math.round(((i+1)/Math.max(1,arr.length))*100),`Arquivo ${i+1}/${arr.length}`);
      }
      aiRebuildDataFiles();aiRenderAttachments();renderAIAnalysis();aiUpdateAIState();aiScrollChat();aiSetUploadProgress(100,'Dados prontos');
    };
    function initV1413Theme(){
      const saved=localStorage.getItem('centralAI.theme')||'light';
      document.body.classList.toggle('dark',saved==='dark');document.documentElement.classList.toggle('dark',saved==='dark');
      document.querySelector('#themeToggle')?.addEventListener('click',()=>{
        const dark=!document.body.classList.contains('dark');
        document.body.classList.toggle('dark',dark);document.documentElement.classList.toggle('dark',dark);localStorage.setItem('centralAI.theme',dark?'dark':'light');
      });
    }
    try{initMobileExperience();}catch(e){console.warn('Experiência mobile indisponível:',e);}
    try{initV1424Interface();}catch(e){console.warn('Interface V14.22 indisponível:',e);}
    try{initV1413Theme();}catch(e){console.warn('Tema V14.13 indisponível:',e);}
try{const aiLang=document.querySelector('#aiLanguageSelect');if(aiLang)aiLang.value=currentLanguage;}catch{}
// Mantém a atualização de cache desacoplada de versões anteriores do listener PWA.
navigator.serviceWorker?.addEventListener?.('message',event=>{if(event.data?.type==='cora-cache-updated'&&event.data?.version==='15.1.13.22'&&localStorage.getItem('cora.sw.loaded')!=='15.1.13.22'){localStorage.setItem('cora.sw.loaded','15.1.13.22');location.reload();}});
try{registerOfflineSupport();}catch(e){console.warn('Offline support indisponível:',e);}
