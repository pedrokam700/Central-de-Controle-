import re
import unicodedata
from datetime import datetime
from typing import Any


def normalizar_sn(valor: Any) -> str:
    if valor is None:
        return ""
    texto = str(valor).strip()
    if texto.endswith(".0") and texto[:-2].isdigit():
        texto = texto[:-2]
    return texto


def normalizar_texto(valor: Any) -> str:
    if valor is None:
        return ""
    texto = str(valor).strip().lower().replace("：", ":")
    texto = unicodedata.normalize("NFKD", texto)
    texto = "".join(c for c in texto if not unicodedata.combining(c))
    texto = re.sub(r"\s+", " ", texto)
    return texto.strip()


def chave_coluna(valor: Any) -> str:
    texto = normalizar_texto(valor)
    return re.sub(r"[^a-z0-9]+", "", texto)


def parse_datetime(valor: Any):
    if valor is None or str(valor).strip() == "":
        return None
    if isinstance(valor, datetime):
        return valor
    texto = str(valor).strip()
    formatos = (
        "%Y-%m-%d %H:%M:%S",
        "%Y/%m/%d %H:%M:%S",
        "%d/%m/%Y %H:%M:%S",
        "%Y-%m-%d %H:%M",
        "%d/%m/%Y %H:%M",
    )
    for fmt in formatos:
        try:
            return datetime.strptime(texto, fmt)
        except ValueError:
            pass
    try:
        return datetime.fromisoformat(texto)
    except ValueError:
        return None
