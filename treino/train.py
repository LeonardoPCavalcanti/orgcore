"""
Treino do modelo de conteúdo da Conect2AI a partir dos datasets exportados pela intranet.

Dois modos, ambos com QLoRA (4-bit) para caber em uma GPU gratuita (Colab/Kaggle T4):

  sft  — fine-tuning supervisionado nos exemplos APROVADOS (imitar o que foi validado).
         Consome o arquivo baixado em "Dataset SFT (aprovados)"  (conect2ai-sft.jsonl).

  kto  — preferência a partir do sinal binário Aprovar/Reprovar (sem pares).
         Consome o arquivo baixado em "Dataset KTO (preferência)" (conect2ai-kto.jsonl).

Uso:
  python train.py --mode sft --dataset conect2ai-sft.jsonl
  python train.py --mode kto --dataset conect2ai-kto.jsonl --base-model Qwen/Qwen2.5-3B-Instruct

O resultado é um adaptador LoRA em ./saida-<mode> — leve, para carregar sobre o modelo base
na hora de servir. Comece com SFT; rode KTO depois, sobre a base, quando houver reprovados.
"""

import argparse

import torch
from datasets import load_dataset
from peft import LoraConfig
from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig

# Modelo base padrão: aberto (sem gating), pequeno e bom em PT-BR/instruções. Troque por
# outro aberto se preferir (ex.: meta-llama/Llama-3.2-3B-Instruct exige aceitar a licença).
BASE_PADRAO = "Qwen/Qwen2.5-3B-Instruct"


def parse_args():
    p = argparse.ArgumentParser(description="Treino SFT/KTO do conteúdo Conect2AI")
    p.add_argument("--mode", choices=["sft", "kto"], required=True)
    p.add_argument("--dataset", required=True, help="Caminho do .jsonl exportado pela intranet")
    p.add_argument("--base-model", default=BASE_PADRAO)
    p.add_argument("--output", default=None, help="Pasta de saída (padrão: ./saida-<mode>)")
    p.add_argument("--epochs", type=float, default=3.0)
    p.add_argument("--lr", type=float, default=2e-4)
    p.add_argument("--batch-size", type=int, default=1)
    p.add_argument("--grad-accum", type=int, default=8)
    p.add_argument("--max-len", type=int, default=1024)
    return p.parse_args()


def carregar_base(nome):
    """Carrega o modelo base em 4-bit (QLoRA) e o tokenizer."""
    quant = BitsAndBytesConfig(
        load_in_4bit=True,
        bnb_4bit_quant_type="nf4",
        bnb_4bit_compute_dtype=torch.bfloat16,
        bnb_4bit_use_double_quant=True,
    )
    modelo = AutoModelForCausalLM.from_pretrained(
        nome, quantization_config=quant, device_map="auto", torch_dtype=torch.bfloat16
    )
    tok = AutoTokenizer.from_pretrained(nome)
    if tok.pad_token is None:
        tok.pad_token = tok.eos_token
    return modelo, tok


def lora():
    """Alvos de LoRA comuns a arquiteturas Llama/Qwen. r=16 é um bom ponto de partida."""
    return LoraConfig(
        r=16, lora_alpha=32, lora_dropout=0.05, bias="none", task_type="CAUSAL_LM",
        target_modules=["q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj"],
    )


def treinar_sft(args, modelo, tok):
    from trl import SFTConfig, SFTTrainer

    dados = load_dataset("json", data_files=args.dataset, split="train")
    if len(dados) == 0:
        raise SystemExit("Dataset SFT vazio — aprove algumas peças na intranet antes de treinar.")
    cfg = SFTConfig(
        output_dir=args.output or "saida-sft",
        num_train_epochs=args.epochs,
        per_device_train_batch_size=args.batch_size,
        gradient_accumulation_steps=args.grad_accum,
        learning_rate=args.lr,
        max_length=args.max_len,
        logging_steps=5,
        save_strategy="epoch",
        bf16=True,
    )
    # O dataset tem a coluna "messages": o SFTTrainer aplica o chat template sozinho.
    trainer = SFTTrainer(model=modelo, args=cfg, train_dataset=dados, peft_config=lora(), processing_class=tok)
    trainer.train()
    trainer.save_model()


def treinar_kto(args, modelo, tok):
    from trl import KTOConfig, KTOTrainer

    dados = load_dataset("json", data_files=args.dataset, split="train")
    if len(dados) == 0:
        raise SystemExit("Dataset KTO vazio — avalie (Aprovar/Reprovar) algumas peças antes.")
    cfg = KTOConfig(
        output_dir=args.output or "saida-kto",
        num_train_epochs=args.epochs,
        per_device_train_batch_size=args.batch_size,
        gradient_accumulation_steps=args.grad_accum,
        learning_rate=args.lr,
        max_length=args.max_len,
        logging_steps=5,
        save_strategy="epoch",
        bf16=True,
    )
    # Dataset no formato {prompt, completion, label} — o que o KTOTrainer espera.
    trainer = KTOTrainer(model=modelo, args=cfg, train_dataset=dados, processing_class=tok, peft_config=lora())
    trainer.train()
    trainer.save_model()


def main():
    args = parse_args()
    modelo, tok = carregar_base(args.base_model)
    if args.mode == "sft":
        treinar_sft(args, modelo, tok)
    else:
        treinar_kto(args, modelo, tok)
    print(f"Pronto. Adaptador LoRA salvo em {args.output or ('saida-' + args.mode)}")


if __name__ == "__main__":
    main()
