from fastapi import FastAPI, UploadFile, File, HTTPException
from PIL import Image
from torchvision import transforms
import torch
import torch.nn as nn
import io
import json
import os

app = FastAPI()

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.path.join(BASE_DIR, "plant_disease_98.pth")
CLASS_NAMES_PATH = os.path.join(BASE_DIR, "class_names.json")

device = torch.device("cuda" if torch.cuda.is_available() else "cpu")


# Copy EXACTLY model architecture from train_plant_disease_test.py
class PlantDiseaseModel(nn.Module):
    def __init__(self, num_classes=38):
        super().__init__()

        self.conv = nn.Sequential(
            nn.Conv2d(3, 16, kernel_size=3, padding=1),
            nn.BatchNorm2d(16),
            nn.ReLU(),
            nn.MaxPool2d(2),

            nn.Conv2d(16, 32, kernel_size=3, padding=1),
            nn.BatchNorm2d(32),
            nn.ReLU(),
            nn.MaxPool2d(2),

            nn.Conv2d(32, 64, kernel_size=3, padding=1),
            nn.BatchNorm2d(64),
            nn.ReLU(),
            nn.MaxPool2d(2),

            nn.Conv2d(64, 128, kernel_size=3, padding=1),
            nn.BatchNorm2d(128),
            nn.ReLU(),
            nn.MaxPool2d(2),

            nn.Conv2d(128, 256, kernel_size=3, padding=1),
            nn.BatchNorm2d(256),
            nn.ReLU(),
            nn.MaxPool2d(2),
        )

        self.head = nn.Sequential(
            nn.Flatten(),
            nn.Dropout(0.5),
            nn.Linear(256 * 8 * 8, num_classes)
        )

    def forward(self, x):
        x = self.conv(x)
        x = self.head(x)
        return x


with open(CLASS_NAMES_PATH, "r", encoding="utf-8") as f:
    class_names = json.load(f)

model = PlantDiseaseModel(num_classes=len(class_names)).to(device)
state_dict = torch.load(MODEL_PATH, map_location=device, weights_only=True)
model.load_state_dict(state_dict)
model.eval()


# Use the same transform as training
transform = transforms.Compose([
    transforms.Resize((256, 256)),
    transforms.ToTensor(),
])


def clean_label(raw_label: str) -> str:
    return raw_label.replace("___", " - ").replace("_", " ")


@app.post("/predict")
async def predict(file: UploadFile = File(...)):
    if not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Uploaded file must be an image")

    image_bytes = await file.read()

    try:
        image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid image file")

    input_tensor = transform(image).unsqueeze(0).to(device)

    with torch.no_grad():
        outputs = model(input_tensor)
        probabilities = torch.softmax(outputs, dim=1)[0]
        confidence, predicted_idx = torch.max(probabilities, dim=0)

    raw_label = class_names[predicted_idx.item()]
    label = clean_label(raw_label)
    confidence_score = round(float(confidence.item()) * 100, 2)

    status = "Healthy" if "healthy" in raw_label.lower() else "Disease detected"

    return {
        "rawLabel": raw_label,
        "label": label,
        "confidence": confidence_score,
        "status": status
    }