# Central de Trabalho + A-MES

**Código e versões oficiais:** este repositório GitHub (`main` + [GitHub Releases](https://github.com/pedrokam700/Central-de-Controle-/releases/latest)).

**Página da Central publicada pelo GitHub:** **[Abrir Central de Trabalho](https://pedrokam700.github.io/Central-de-Controle-/)**

**Baixar o agente Windows/CLEAN:** [última release oficial](https://github.com/pedrokam700/Central-de-Controle-/releases/latest).

O site é implantado pelo workflow [Publish Official Central on GitHub Pages](.github/workflows/publish-github-pages.yml) a partir do SHA **exato da última GitHub Release validada**, e não de branches draft ou de versões não publicadas. O workflow verifica no URL público `release-build.json` que o SHA servido corresponde à release. Depois de uma publicação oficial, o GitHub Pages é atualizado automaticamente quando o workflow de release conclui com sucesso.

O agente A-MES local usa a rede MES e SQLite da fábrica; o site HTTPS não instala ou atualiza automaticamente o agente. Para testar um novo CLEAN, extraia em outra pasta e preserve o banco/identidade do posto e as coletas ativas. **CI aprovado não é homologação física.**

A URL legada da Vercel não é a fonte oficial do projeto nem deve ser usada para inferir qual release está em produção.
