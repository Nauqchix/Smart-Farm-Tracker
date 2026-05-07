# Plant Disease Classification AI Service

This folder contains the AI model service for plant disease classification in the Smart Farm project.

The model is built with PyTorch and served through FastAPI. It receives a plant leaf image, predicts the plant/disease class, returns the confidence score, and can be connected to the existing Next.js backend and frontend tab **Plant Diagnose**.

---

## 1. Overview

The AI service supports the following workflow:

```text
Frontend Plant Diagnose tab
        ↓
Upload leaf photo
        ↓
Next.js API route
        ↓
FastAPI AI service
        ↓
PyTorch CNN model
        ↓
Prediction result
        ↓
Save to database / return to frontend
```

The AI model is a **classification model**, not an object detection model.

It predicts:

```text
Plant type + disease/health status + confidence score
```

It does **not** return bounding boxes like YOLO.

---

## 2. Folder Structure

```bash
plant_disease/
├── __pycache__/
├── class_names.json
├── confusion_matrix.png
├── inference_api.py
├── make_class_name.py
├── plant_disease_89.pth
├── plant_disease_98.pth
├── train_plant_disease_test.py
└── README.md
```

Explanation:

| File | Description |
|---|---|
| `inference_api.py` | FastAPI server used to load the trained PyTorch model and provide prediction API |
| `train_plant_disease_test.py` | Training and evaluation script |
| `plant_disease_89.pth` | Trained model weights |
| `plant_disease_98.pth` | Trained model weights with higher accuracy |
| `class_names.json` | Class labels used by the model |
| `make_class_name.py` | Script for generating `class_names.json` from the dataset |
| `confusion_matrix.png` | Confusion matrix generated after model evaluation |
| `README.md` | Documentation for running this AI module |

---

## 3. Requirements

Make sure Python 3.11 is installed.

Install required Python packages:

```bash
python -m pip install fastapi uvicorn pillow torch torchvision python-multipart
```

If your machine uses `py` instead of `python`, run:

```bash
py -3.11 -m pip install fastapi uvicorn pillow torch torchvision python-multipart
```

---

## 4. Important Notes About `.pth` Files

The trained model is saved as:

```python
torch.save(model.state_dict(), model_name)
```

This means the `.pth` file only stores the model weights, not the whole model object.

Therefore, when loading the model, the CNN architecture in `inference_api.py` must be exactly the same as the architecture used in `train_plant_disease_test.py`.

Do not open `.pth` files directly in VS Code. They are binary PyTorch weight files.

---

## 5. Run the AI Service

From the project root folder `smart-farm`, move into the AI folder:

```bash
cd plant_disease
```

Run the FastAPI server:

```bash
python -m uvicorn inference_api:app --reload --host 127.0.0.1 --port 8001
```

If it runs successfully, the terminal should show:

```bash
Uvicorn running on http://127.0.0.1:8001
Application startup complete.
```

The AI service is now running at:

```text
http://127.0.0.1:8001
```

---

## 6. Open Swagger API Documentation

Open this URL in the browser:

```text
http://127.0.0.1:8001/docs
```

You will see the FastAPI Swagger UI.

Use this endpoint:

```text
POST /predict
```

Steps:

1. Click `POST /predict`
2. Click `Try it out`
3. Choose a leaf image file
4. Click `Execute`
5. Check the prediction result

---

## 7. API Endpoint

### `POST /predict`

This endpoint receives an image file and returns the plant disease prediction.

Request type:

```text
multipart/form-data
```

Required field:

| Field | Type | Description |
|---|---|---|
| `file` | image file | Leaf image uploaded for prediction |

Example request:

```text
POST http://127.0.0.1:8001/predict
Content-Type: multipart/form-data
file: leaf_image.jpg
```

Example response:

```json
{
  "rawLabel": "Blueberry___healthy",
  "label": "Blueberry - healthy",
  "confidence": 74.55,
  "status": "Healthy"
}
```

Response fields:

| Field | Description |
|---|---|
| `rawLabel` | Original class name from the dataset |
| `label` | Cleaned label for displaying on frontend |
| `confidence` | Prediction confidence score in percentage |
| `status` | `Healthy` or `Disease detected` |

---

## 8. Test API with PowerShell

You can test the AI service using PowerShell:

```powershell
Invoke-RestMethod `
  -Uri "http://127.0.0.1:8001/predict" `
  -Method Post `
  -Form @{ file = Get-Item "C:\path\to\leaf_image.jpg" }
```

Replace this path:

```text
C:\path\to\leaf_image.jpg
```

with your real image path.

Example:

```powershell
Invoke-RestMethod `
  -Uri "http://127.0.0.1:8001/predict" `
  -Method Post `
  -Form @{ file = Get-Item "C:\Users\DELL\Desktop\leaf.jpg" }
```

---

## 9. Connect AI Service with Next.js Backend

The AI service runs locally at:

```text
http://127.0.0.1:8001/predict
```

In the root project `.env.local`, add:

```env
PLANT_AI_URL=http://127.0.0.1:8001/predict
```

The recommended backend flow:

```text
Frontend Plant Diagnose tab
        ↓
Next.js API route /api/plant-diagnose
        ↓
FastAPI AI service /predict
        ↓
PyTorch model prediction
        ↓
Save result to database
        ↓
Return result to frontend
```

The frontend should not directly call the FastAPI service. It should call a Next.js API route first.

---

## 10. Example Next.js API Route

Create this file:

```text
src/app/api/plant-diagnose/route.ts
```

Example implementation:

```ts
import { NextRequest, NextResponse } from "next/server";

const AI_SERVICE_URL =
  process.env.PLANT_AI_URL || "http://127.0.0.1:8001/predict";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();

    // Frontend sends image using field name "photo"
    const file = formData.get("photo") as File | null;

    if (!file) {
      return NextResponse.json(
        { message: "No image uploaded" },
        { status: 400 }
      );
    }

    // FastAPI requires field name "file"
    const aiFormData = new FormData();
    aiFormData.append("file", file);

    const aiResponse = await fetch(AI_SERVICE_URL, {
      method: "POST",
      body: aiFormData,
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();

      return NextResponse.json(
        {
          message: "AI service failed",
          detail: errorText,
        },
        { status: 500 }
      );
    }

    const aiResult = await aiResponse.json();

    return NextResponse.json({
      message: "Plant diagnosis completed",
      data: aiResult,
    });
  } catch (error) {
    console.error("[PLANT_DIAGNOSE_ERROR]", error);

    return NextResponse.json(
      { message: "Internal server error" },
      { status: 500 }
    );
  }
}
```

---

## 11. Frontend Integration Example

In the existing **Plant Diagnose** tab, the frontend should send the selected image to:

```text
/api/plant-diagnose
```

Example React/Next.js logic:

```tsx
const [selectedFile, setSelectedFile] = useState<File | null>(null);
const [result, setResult] = useState<any>(null);
const [loading, setLoading] = useState(false);

const handleDetect = async () => {
  if (!selectedFile) {
    alert("Please upload a photo first");
    return;
  }

  setLoading(true);

  const formData = new FormData();
  formData.append("photo", selectedFile);

  const response = await fetch("/api/plant-diagnose", {
    method: "POST",
    body: formData,
  });

  const data = await response.json();

  if (!response.ok) {
    alert(data.message || "Detection failed");
    setLoading(false);
    return;
  }

  setResult(data.data);
  setLoading(false);
};
```

Upload input:

```tsx
<input
  type="file"
  accept="image/*"
  onChange={(e) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
    }
  }}
/>
```

Detect button:

```tsx
<button onClick={handleDetect} disabled={loading}>
  {loading ? "Detecting..." : "Detect"}
</button>
```

Display result:

```tsx
{result && (
  <div>
    <p>Status: {result.status}</p>
    <p>Prediction: {result.label}</p>
    <p>Confidence: {result.confidence}%</p>
  </div>
)}
```

---

## 12. Database Integration Note

The model currently returns:

```json
{
  "rawLabel": "Tomato___Early_blight",
  "label": "Tomato - Early blight",
  "confidence": 96.23,
  "status": "Disease detected"
}
```

Recommended database fields:

```prisma
model AIDetection {
  id              Int      @id @default(autoincrement())
  imageUrl        String?
  label           String
  confidenceScore Float
  status          String
  boundingBox     String?
  createdAt       DateTime @default(now())
}
```

Because this is a classification model, it does not return bounding boxes.

If your database has a `boundingBox` field, you can store:

```json
[]
```

or make the field optional:

```prisma
boundingBox String?
```

After editing Prisma schema, run:

```bash
npx prisma generate
npx prisma db push
```

---

## 13. Run the Full Project

You need to run two servers at the same time.

### Terminal 1: Run AI Service

From the root project folder:

```bash
cd plant_disease
python -m uvicorn inference_api:app --reload --host 127.0.0.1 --port 8001
```

### Terminal 2: Run Next.js App

From the root project folder:

```bash
npm install
npm run dev
```

Then open the web app and use:

```text
Plant Diagnose → Upload photo → Detect
```

---

## 14. Dataset

The model was trained on the New Plant Diseases Dataset (Augmented).

Typical dataset structure:

```bash
New Plant Diseases Dataset(Augmented)/
├── train/
│   ├── Apple___Apple_scab/
│   ├── Apple___Black_rot/
│   ├── Blueberry___healthy/
│   └── ...
└── valid/
    ├── Apple___Apple_scab/
    ├── Apple___Black_rot/
    ├── Blueberry___healthy/
    └── ...
```

The class labels are stored in:

```text
class_names.json
```

This file must match the same class order used during training.

---

## 15. Generate `class_names.json`

If `class_names.json` is missing, generate it from the dataset.

Example script:

```python
from pathlib import Path
import json
from torchvision.datasets import ImageFolder

BASE_DIR = Path(__file__).resolve().parent

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
```

Run:

```bash
python make_class_name.py
```

Expected output:

```text
Saved 38 classes to class_names.json
```

---

## 16. Common Errors and Fixes

### Error: `ModuleNotFoundError: No module named 'PIL'`

Cause:

```python
from PIL import Image
```

requires Pillow.

Fix:

```bash
python -m pip install pillow
```

---

### Error: `uvicorn is not recognized`

Cause: `uvicorn` is installed but not added to PATH.

Fix: run uvicorn through Python:

```bash
python -m uvicorn inference_api:app --reload --host 127.0.0.1 --port 8001
```

---

### Error: `Could not import module "inference_api"`

Cause: The command is being run from the wrong directory.

Wrong:

```bash
# Running this from smart-farm root may fail
python -m uvicorn inference_api:app --reload --host 127.0.0.1 --port 8001
```

Correct:

```bash
cd plant_disease
python -m uvicorn inference_api:app --reload --host 127.0.0.1 --port 8001
```

Alternative from root:

```bash
python -m uvicorn plant_disease.inference_api:app --reload --host 127.0.0.1 --port 8001
```

If using the alternative, you may need to add an empty file:

```text
plant_disease/__init__.py
```

---

### Error: `class_names.json not found`

Cause: `inference_api.py` needs `class_names.json`.

Fix: make sure this file exists:

```text
plant_disease/class_names.json
```

If missing, run:

```bash
python make_class_name.py
```

---

### Error: `Missing key(s) in state_dict` or `Unexpected key(s) in state_dict`

Cause: The model architecture in `inference_api.py` does not match the architecture used when training.

Fix: Make sure the `PlantDiseaseModel` class in `inference_api.py` is the same as the model class in `train_plant_disease_test.py`.

---

### Error: `size mismatch`

Cause: The number of filters, input size, or final linear layer size is different from the trained model.

Example:

```text
size mismatch for conv.0.weight
size mismatch for head.2.weight
```

Fix:

Check the trained weight shapes:

```python
import torch

state_dict = torch.load("plant_disease_98.pth", map_location="cpu")

for name, weight in state_dict.items():
    print(name, weight.shape)
```

Then update the model architecture in `inference_api.py` to match the saved weights.

For this project, the working CNN structure uses:

```text
16 → 32 → 64 → 128 → 256
```

and image input size:

```text
256 × 256
```

---

### Browser shows `{"detail":"Not Found"}` at `/`

This is normal if no route is defined for `/`.

Use:

```text
http://127.0.0.1:8001/docs
```

or add this route in `inference_api.py`:

```python
@app.get("/")
def health_check():
    return {
        "message": "Plant Disease AI service is running",
        "docs": "http://127.0.0.1:8001/docs",
        "predict_endpoint": "POST /predict"
    }
```

---

### Swagger shows `422 Validation Error`

This is not always an actual error. Swagger displays possible error responses.

A `422` error happens if:

```text
- No file is uploaded
- Wrong field name is used
- Body is not multipart/form-data
```

The `/predict` endpoint requires the field name:

```text
file
```

---

## 17. Git Commands

To add this README and push to the current branch:

```bash
git add plant_disease/README.md
git commit -m "Add AI model running instructions"
git push
```

To check current branch:

```bash
git branch
```

To check changed files:

```bash
git status
```

---

## 18. Quick Start Summary

Run AI service:

```bash
cd plant_disease
python -m uvicorn inference_api:app --reload --host 127.0.0.1 --port 8001
```

Open API docs:

```text
http://127.0.0.1:8001/docs
```

Run Next.js app:

```bash
npm install
npm run dev
```

Use app:

```text
Plant Diagnose → Upload photo → Detect
```

Expected AI response:

```json
{
  "rawLabel": "Blueberry___healthy",
  "label": "Blueberry - healthy",
  "confidence": 74.55,
  "status": "Healthy"
}
```