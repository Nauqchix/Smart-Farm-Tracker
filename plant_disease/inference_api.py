from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image
from torchvision import transforms
import torch
import torch.nn as nn
import io
import json
import os

app = FastAPI(
    title="Plant Disease AI Service",
    description="PyTorch CNN model for plant disease classification",
    version="1.0.0",
)

# Allow Next.js dev server and common local origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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

# Confidence threshold — predictions below this are marked "uncertain"
CONFIDENCE_THRESHOLD = 40.0

# ─── Disease suggestion mapping ────────────────────────────────────────────────
# Maps each class name to a care/treatment suggestion. Healthy classes get
# general care advice; diseased classes get specific treatment recommendations.

DISEASE_SUGGESTIONS: dict[str, str] = {
    # Apple
    "Apple___Apple_scab":
        "Remove and destroy fallen leaves. Apply fungicide (captan or myclobutanil) "
        "during early spring. Ensure good air circulation by pruning dense branches.",
    "Apple___Black_rot":
        "Prune out dead or diseased branches. Remove mummified fruit from the tree and ground. "
        "Apply fungicide (captan or thiophanate-methyl) from bud break through harvest.",
    "Apple___Cedar_apple_rust":
        "Remove nearby juniper/cedar hosts if possible. Apply fungicide (myclobutanil) "
        "starting at pink bud stage. Choose rust-resistant apple varieties for future planting.",
    "Apple___healthy":
        "Your apple plant looks healthy! Continue regular watering, balanced fertilization, "
        "and annual pruning. Monitor for early signs of pests or disease.",

    # Blueberry
    "Blueberry___healthy":
        "Your blueberry plant looks healthy! Maintain acidic soil (pH 4.5–5.5), "
        "mulch with pine needles, and ensure consistent moisture.",

    # Cherry
    "Cherry_(including_sour)___Powdery_mildew":
        "Apply sulfur-based or potassium bicarbonate fungicide at first sign of infection. "
        "Improve air circulation by pruning. Avoid overhead watering.",
    "Cherry_(including_sour)___healthy":
        "Your cherry plant looks healthy! Keep soil well-drained, prune annually "
        "for airflow, and monitor for borers and leaf spot.",

    # Corn
    "Corn_(maize)___Cercospora_leaf_spot Gray_leaf_spot":
        "Rotate crops to reduce inoculum. Use resistant hybrids. Apply foliar fungicide "
        "(strobilurin or triazole) if disease pressure is high at or before tasseling.",
    "Corn_(maize)___Common_rust_":
        "Plant rust-resistant hybrids. Apply fungicide (azoxystrobin or propiconazole) "
        "if rust appears before tasseling and conditions favor spread.",
    "Corn_(maize)___Northern_Leaf_Blight":
        "Use resistant hybrids and practice crop rotation. Apply foliar fungicide "
        "at early infection stages. Remove crop debris after harvest.",
    "Corn_(maize)___healthy":
        "Your corn plant looks healthy! Ensure adequate nitrogen, consistent irrigation, "
        "and watch for common pests like corn borers.",

    # Grape
    "Grape___Black_rot":
        "Remove mummified berries and infected leaves. Apply fungicide (myclobutanil or mancozeb) "
        "from bud break through 4 weeks after bloom. Ensure good canopy management.",
    "Grape___Esca_(Black_Measles)":
        "No chemical cure exists for Esca. Remove and destroy severely infected vines. "
        "Avoid large pruning wounds and apply wound sealant. Manage vine stress.",
    "Grape___Leaf_blight_(Isariopsis_Leaf_Spot)":
        "Apply fungicide (copper-based or mancozeb). Remove infected leaves and improve "
        "canopy airflow through pruning. Avoid overhead irrigation.",
    "Grape___healthy":
        "Your grape vine looks healthy! Continue balanced fertilization, proper trellising, "
        "and regular canopy management for good air circulation.",

    # Orange
    "Orange___Haunglongbing_(Citrus_greening)":
        "There is no cure for citrus greening. Remove and destroy infected trees to prevent spread. "
        "Control Asian citrus psyllid vectors with insecticide. Plant disease-free nursery stock.",

    # Peach
    "Peach___Bacterial_spot":
        "Apply copper-based bactericide during dormant season. Avoid overhead irrigation. "
        "Choose resistant varieties. Prune for good air circulation.",
    "Peach___healthy":
        "Your peach tree looks healthy! Thin fruit for better size, prune annually, "
        "and apply dormant oil spray in late winter.",

    # Pepper
    "Pepper,_bell___Bacterial_spot":
        "Use disease-free seed and transplants. Apply copper-based bactericide preventatively. "
        "Rotate crops and avoid working with wet plants. Remove infected debris.",
    "Pepper,_bell___healthy":
        "Your pepper plant looks healthy! Maintain consistent watering, "
        "provide support for heavy fruit, and watch for aphids.",

    # Potato
    "Potato___Early_blight":
        "Apply fungicide (chlorothalonil or mancozeb) at first sign of disease. "
        "Practice crop rotation (3+ years). Remove volunteer potatoes and plant debris.",
    "Potato___Late_blight":
        "Apply fungicide immediately (chlorothalonil, mancozeb, or metalaxyl). "
        "Destroy infected plants to prevent spread. Avoid overhead irrigation. "
        "This is a serious disease — act quickly.",
    "Potato___healthy":
        "Your potato plant looks healthy! Hill soil around stems as they grow, "
        "maintain even moisture, and harvest when foliage dies back.",

    # Raspberry
    "Raspberry___healthy":
        "Your raspberry plant looks healthy! Prune spent canes after fruiting, "
        "provide trellis support, and maintain good air circulation.",

    # Soybean
    "Soybean___healthy":
        "Your soybean plant looks healthy! Monitor for aphids and bean leaf beetles. "
        "Ensure adequate potassium and phosphorus levels.",

    # Squash
    "Squash___Powdery_mildew":
        "Apply fungicide (potassium bicarbonate, neem oil, or sulfur) at first sign. "
        "Improve spacing for air circulation. Water at the base, not on leaves. "
        "Remove heavily infected leaves.",

    # Strawberry
    "Strawberry___Leaf_scorch":
        "Remove and destroy infected leaves. Apply fungicide (captan or copper) preventatively. "
        "Ensure good drainage and air circulation. Avoid overhead watering.",
    "Strawberry___healthy":
        "Your strawberry plant looks healthy! Mulch to keep fruit clean, "
        "remove runners for larger berries, and renovate beds annually.",

    # Tomato
    "Tomato___Bacterial_spot":
        "Apply copper-based bactericide. Use disease-free seed and transplants. "
        "Rotate crops and avoid working with wet plants. Remove infected debris.",
    "Tomato___Early_blight":
        "Apply fungicide (chlorothalonil or copper). Mulch around plants to prevent "
        "soil splash. Prune lower leaves and practice crop rotation.",
    "Tomato___Late_blight":
        "Apply fungicide immediately (chlorothalonil or copper). Remove and destroy "
        "infected plants. This disease spreads rapidly in cool, wet conditions — act fast.",
    "Tomato___Leaf_Mold":
        "Improve greenhouse ventilation. Apply fungicide (chlorothalonil or mancozeb). "
        "Reduce humidity and avoid overhead watering. Use resistant varieties.",
    "Tomato___Septoria_leaf_spot":
        "Remove infected lower leaves. Apply fungicide (chlorothalonil or copper). "
        "Mulch around plants, practice crop rotation, and avoid overhead watering.",
    "Tomato___Spider_mites Two-spotted_spider_mite":
        "Spray plants with a strong stream of water to dislodge mites. Apply miticide "
        "or insecticidal soap. Increase humidity around plants. Introduce predatory mites.",
    "Tomato___Target_Spot":
        "Apply fungicide (chlorothalonil or mancozeb). Remove infected leaves. "
        "Improve air circulation and avoid overhead irrigation.",
    "Tomato___Tomato_Yellow_Leaf_Curl_Virus":
        "There is no cure. Remove and destroy infected plants immediately. "
        "Control whitefly vectors with insecticide or reflective mulch. "
        "Use resistant varieties for future planting.",
    "Tomato___Tomato_mosaic_virus":
        "There is no cure. Remove and destroy infected plants. Disinfect tools with "
        "10% bleach solution. Wash hands before handling plants. Use resistant varieties.",
    "Tomato___healthy":
        "Your tomato plant looks healthy! Provide consistent watering, stake or cage "
        "for support, and remove suckers for better fruit production.",
}


def clean_label(raw_label: str) -> str:
    """Convert raw class name to human-readable label."""
    return raw_label.replace("___", " - ").replace("_", " ")


def extract_plant_and_disease(raw_label: str) -> tuple[str, str | None]:
    """Extract plant name and disease name from raw class label."""
    parts = raw_label.split("___")
    plant = parts[0].replace("_", " ") if parts else raw_label
    disease = None
    if len(parts) > 1:
        disease_raw = parts[1]
        if disease_raw.lower() != "healthy":
            disease = disease_raw.replace("_", " ").strip()
    return plant, disease


@app.get("/")
def health_check():
    """Health check endpoint."""
    return {
        "service": "Plant Disease AI",
        "status": "running",
        "model": "plant_disease_98.pth",
        "classes": len(class_names),
        "device": str(device),
        "docs": "/docs",
        "predict_endpoint": "POST /predict",
    }


@app.post("/predict")
async def predict(file: UploadFile = File(...)):
    if not file.content_type or not file.content_type.startswith("image/"):
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

    plant, disease = extract_plant_and_disease(raw_label)
    is_healthy = "healthy" in raw_label.lower()

    # Determine status
    if confidence_score < CONFIDENCE_THRESHOLD:
        status = "uncertain"
        suggestion = (
            "The prediction confidence is too low to provide a reliable diagnosis. "
            "Please retake the photo with better lighting, a plain background, "
            "and ensure the leaf fills most of the frame."
        )
    elif is_healthy:
        status = "healthy"
        suggestion = DISEASE_SUGGESTIONS.get(
            raw_label,
            "Your plant looks healthy! Continue regular care and monitoring.",
        )
    else:
        status = "diseased"
        suggestion = DISEASE_SUGGESTIONS.get(
            raw_label,
            "Disease detected. Consult a local agricultural expert for treatment options.",
        )

    return {
        # Original fields (backward compatible)
        "rawLabel": raw_label,
        "label": label,
        "confidence": confidence_score,
        # Enhanced fields
        "status": status,
        "plant": plant,
        "disease": disease,
        "suggestion": suggestion,
    }