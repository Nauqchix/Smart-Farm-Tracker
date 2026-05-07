from pathlib import Path
import json
from torchvision.datasets import ImageFolder

BASE_DIR = Path(__file__).resolve().parent

# Tự tìm thư mục train trong dataset
train_dirs = [
    p for p in BASE_DIR.rglob("train")
    if p.is_dir() and len([x for x in p.iterdir() if x.is_dir()]) >= 10
]

if not train_dirs:
    raise FileNotFoundError("Cannot find train folder with class subfolders.")

train_dir = train_dirs[0]

print("Using train directory:")
print(train_dir)

dataset = ImageFolder(train_dir)
class_names = dataset.classes

output_path = BASE_DIR / "class_names.json"

with open(output_path, "w", encoding="utf-8") as f:
    json.dump(class_names, f, indent=2, ensure_ascii=False)

print(f"Saved {len(class_names)} classes to {output_path}")
print(class_names)