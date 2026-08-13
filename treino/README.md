# Treino do modelo de conteúdo (Conect2AI)

Pipeline para melhorar o gerador de anúncios a partir das avaliações feitas na intranet.
Roda em GPU gratuita (Google Colab / Kaggle T4). Não é necessário para o produto funcionar —
é a etapa de "aprendizado de verdade", quando já houver material avaliado.

## Fluxo

1. **Gerar e avaliar** peças na intranet (botões Aprovar/Reprovar). Quanto mais, melhor —
   mire em algumas dezenas de exemplos antes do primeiro treino.
2. **Exportar os datasets** na tela de anúncios:
   - `Dataset SFT (aprovados)` → `conect2ai-sft.jsonl`
   - `Dataset KTO (preferência)` → `conect2ai-kto.jsonl`
3. **Treinar** (nesta pasta):
   ```bash
   pip install -r requirements.txt
   python train.py --mode sft --dataset conect2ai-sft.jsonl
   # depois, quando houver reprovados:
   python train.py --mode kto --dataset conect2ai-kto.jsonl
   ```
4. O resultado é um **adaptador LoRA** em `saida-sft/` (ou `saida-kto/`) — leve, para
   carregar sobre o modelo base ao servir.

## Ordem recomendada

- **SFT primeiro**: ensina o tom/estilo a partir dos aprovados.
- **KTO depois**, sobre a base: usa aprovados **e** reprovados (sinal binário) para afinar
  a preferência. É o "RL prático" que casa com o nosso Aprovar/Reprovar.

## Modelo base

Padrão: `Qwen/Qwen2.5-3B-Instruct` (aberto, sem gating, bom em português). Troque com
`--base-model`. Modelos maiores rendem mais, mas exigem GPU melhor.

## Servir o modelo treinado

O adaptador roda atrás de um endpoint compatível com OpenAI (ex.: vLLM ou TGI com
`--lora-modules`). Basta apontar as variáveis da intranet para esse endpoint:
`LLM_BASE_URL`, `LLM_MODELO`, `LLM_API_KEY`. Nenhuma mudança de código no produto.

## Requisitos

- GPU com ~15 GB (T4 do Colab/Kaggle serve para 3B em 4-bit).
- Datasets exportados da intranet (passo 2).
