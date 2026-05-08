# CNN Logic Used in Plant Disease Classification Model

This document explains the CNN algorithm and model logic used in the **Plant Disease Classification AI Service** of the Smart Farm project.

The model is designed to receive a plant leaf image, extract visual features from the image, classify the leaf into a plant disease class, and return the prediction result through the FastAPI inference service.

---

## 1. General Overview

The AI model in this project uses a **Convolutional Neural Network (CNN)**.

CNN is a deep learning algorithm widely used for image processing tasks such as:

- Image classification
- Object recognition
- Visual pattern detection
- Texture and feature analysis

In this project, CNN is used for **plant disease classification**. The model receives a leaf image as input and predicts the plant type and disease status.

Example API response:

```json
{
  "rawLabel": "Tomato___Late_blight",
  "label": "Tomato - Late blight",
  "confidence": 42.91,
  "status": "Disease detected"
}
```

This means the model predicts that the uploaded image is a tomato leaf affected by **Late blight**, with a confidence score of **42.91%**.

---

## 2. Why CNN Is Used

Plant disease recognition is highly dependent on visual symptoms shown on leaves.

Common disease symptoms include:

- Leaf color changes
- Yellow or brown spots
- Blight areas
- Mold-like patterns
- Damaged leaf edges
- Abnormal leaf texture

Traditional image processing would require manually designed rules to detect these features. For example, developers would need to define color thresholds, spot shapes, or texture patterns manually.

CNN solves this problem by automatically learning visual features from training images.

During training, the CNN learns which visual patterns are related to healthy leaves and which patterns are related to specific plant diseases.

---

## 3. Input Data

The input of the model is a plant leaf image.

Before being passed into the CNN model, the image is preprocessed using:

```python
transforms.Resize((256, 256))
transforms.ToTensor()
```

This means that each uploaded image is resized to:

```text
256 × 256 pixels
```

Then the image is converted into a PyTorch tensor.

The input tensor shape is:

```text
3 × 256 × 256
```

Where:

```text
3     = RGB color channels
256   = image height
256   = image width
```

---

## 4. CNN Architecture

The CNN model follows this general structure:

```text
Input Leaf Image
      ↓
Convolution Block 1
      ↓
Convolution Block 2
      ↓
Convolution Block 3
      ↓
Convolution Block 4
      ↓
Convolution Block 5
      ↓
Flatten
      ↓
Dropout
      ↓
Fully Connected Layer
      ↓
Prediction Output
```

The feature channels increase gradually through the convolution blocks:

```text
3 → 16 → 32 → 64 → 128 → 256
```

This means the model starts from the original RGB image with 3 channels, then gradually extracts more complex features through deeper layers.

---

## 5. Main CNN Components

### 5.1 Convolution Layer

The **Convolution Layer** is the core component of CNN.

Its purpose is to scan the image using small filters, also called kernels, to detect local visual patterns.

The model can learn features such as:

- Leaf edges
- Color changes
- Spots
- Disease marks
- Leaf texture
- Damaged regions

In early layers, the model usually learns simple features such as edges and colors. In deeper layers, it can learn more complex features such as disease spots, blight patterns, or abnormal leaf regions.

In this project, convolution layers are implemented using:

```python
nn.Conv2d(...)
```

Example:

```python
nn.Conv2d(3, 16, kernel_size=3, padding=1)
```

Meaning:

| Parameter | Meaning |
|---|---|
| `3` | Number of input channels, corresponding to RGB image |
| `16` | Number of output feature maps |
| `kernel_size=3` | The filter size is 3×3 |
| `padding=1` | Adds padding to preserve spatial size after convolution |

The first convolution layer transforms the image from:

```text
3 color channels → 16 feature maps
```

---

### 5.2 Batch Normalization

After each convolution layer, the model applies **Batch Normalization**:

```python
nn.BatchNorm2d(...)
```

Batch Normalization normalizes feature values during training.

Its benefits include:

- Making training more stable
- Helping the model converge faster
- Reducing unstable value distributions between layers
- Improving model performance

In simple terms, Batch Normalization helps the model learn more smoothly and prevents feature values from becoming too large or too small.

---

### 5.3 ReLU Activation Function

After Batch Normalization, the model uses the **ReLU** activation function:

```python
nn.ReLU()
```

ReLU stands for **Rectified Linear Unit**.

Formula:

```text
ReLU(x) = max(0, x)
```

Meaning:

```text
If x > 0  → keep x
If x ≤ 0  → convert x to 0
```

ReLU introduces non-linearity into the neural network.

Without activation functions like ReLU, the model would not be able to learn complex relationships between visual features and disease labels.

In this project, ReLU helps the model learn complex visual patterns from leaf color, texture, disease spots, and damaged areas.

---

### 5.4 Max Pooling Layer

The model uses **Max Pooling**:

```python
nn.MaxPool2d(2)
```

Max Pooling reduces the spatial size of feature maps while keeping the most important features.

The feature map size is reduced as follows:

```text
256 × 256 → 128 × 128
128 × 128 → 64 × 64
64 × 64 → 32 × 32
32 × 32 → 16 × 16
16 × 16 → 8 × 8
```

Benefits of Max Pooling:

- Reduces computation
- Keeps the strongest features
- Makes the model less sensitive to small image shifts
- Helps reduce overfitting

After 5 Max Pooling operations, the final feature map size becomes:

```text
256 × 8 × 8
```

---

### 5.5 Flatten Layer

After the convolution blocks, the data is still represented as multiple 2D feature maps.

Before classification, the model uses:

```python
nn.Flatten()
```

The Flatten layer converts the 3D feature maps into a 1D feature vector.

Final feature map shape:

```text
256 × 8 × 8
```

After flattening:

```text
256 × 8 × 8 = 16,384 features
```

This means the CNN extracts **16,384 learned visual features** from the original leaf image.

---

### 5.6 Dropout Layer

The model uses **Dropout**:

```python
nn.Dropout(0.5)
```

Dropout is a regularization technique used to reduce overfitting.

During training, Dropout randomly disables some neurons. With:

```text
Dropout(0.5)
```

approximately 50% of neurons may be ignored during each training step.

Benefits:

- Reduces overfitting
- Improves generalization
- Prevents the model from depending too much on specific neurons

In simple terms, Dropout makes the model more robust when predicting unseen images.

---

### 5.7 Fully Connected Layer

The final classification layer is a **Fully Connected Layer**, also called a linear layer:

```python
nn.Linear(256 * 8 * 8, num_classes)
```

Since:

```text
256 × 8 × 8 = 16,384
```

this layer receives 16,384 extracted features and outputs prediction scores for all classes.

If the dataset contains 38 classes:

```text
num_classes = 38
```

Then the output is a vector of 38 values. Each value represents the model score for one plant disease class.

---

## 6. Prediction Process

The prediction process works as follows:

```text
Input leaf image
      ↓
Resize image to 256×256
      ↓
Convert image to tensor
      ↓
Pass image through convolution blocks
      ↓
Extract visual features
      ↓
Flatten features into a vector
      ↓
Pass features through the fully connected layer
      ↓
Generate raw scores for each class
      ↓
Apply Softmax
      ↓
Select class with highest probability
      ↓
Return label, confidence, and status
```

In the API, Softmax is used to convert raw model scores into probabilities:

```python
probabilities = torch.softmax(outputs, dim=1)
```

Then the class with the highest probability is selected:

```python
confidence, predicted_idx = torch.max(probabilities, dim=0)
```

The predicted class index is mapped back to the real class name using:

```python
class_names[predicted_idx.item()]
```

---

## 7. Healthy or Disease Detection Logic

The model predicts a class label such as:

```text
Tomato___healthy
Tomato___Late_blight
Apple___Black_rot
Potato___Early_blight
```

The API then checks whether the predicted label contains the word:

```text
healthy
```

If the predicted label contains `healthy`, the system returns:

```text
Healthy
```

Otherwise, it returns:

```text
Disease detected
```

Examples:

```text
Tomato___healthy       → Healthy
Tomato___Late_blight   → Disease detected
Apple___Black_rot      → Disease detected
```

---

## 8. Architecture Summary

The CNN architecture can be summarized as:

```text
Input: RGB image resized to 256×256

Block 1:
Conv2d 3 → 16
BatchNorm2d
ReLU
MaxPool2d

Block 2:
Conv2d 16 → 32
BatchNorm2d
ReLU
MaxPool2d

Block 3:
Conv2d 32 → 64
BatchNorm2d
ReLU
MaxPool2d

Block 4:
Conv2d 64 → 128
BatchNorm2d
ReLU
MaxPool2d

Block 5:
Conv2d 128 → 256
BatchNorm2d
ReLU
MaxPool2d

Classifier:
Flatten
Dropout
Linear 16,384 → number of classes
```

---

## 9. Model Code Structure

The core model architecture is implemented as follows:

```python
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
```

---

## 10. Strengths of CNN in This Project

CNN is suitable for the plant disease classification task because:

- It automatically learns image features
- It is effective for image classification
- It can recognize leaf color, texture, and disease spots
- It reduces the need for manual feature engineering
- It can classify many plant disease classes
- It works well with structured image datasets

---

## 11. Current Model Limitations

Although CNN is effective for this task, the current model has several limitations:

- It can only recognize classes included in the training dataset
- It may give incorrect predictions for unsupported plant types
- Low-confidence predictions may be unreliable
- It cannot locate the diseased area on the leaf
- It does not return bounding boxes
- It requires retraining or fine-tuning to support new plant species or diseases

Therefore, the current model should be understood as a **plant disease image classification model**, not an object detection model like YOLO.

---

## 12. Short Summary for Report

The model uses a **Convolutional Neural Network (CNN)** to classify plant leaf images. CNN is suitable for this task because it can automatically learn visual features such as leaf color, surface texture, disease spots, and damaged regions. The input image is resized to 256×256 pixels and converted into a tensor before being passed into the model.

The architecture contains multiple convolution blocks. Each block includes Convolution, Batch Normalization, ReLU, and Max Pooling. The number of feature channels increases from 16 to 256, allowing the model to learn from simple features to more complex disease-related patterns. After feature extraction, the output is flattened into a 16,384-dimensional feature vector, then passed through Dropout and a Fully Connected Layer for classification. Finally, Softmax is used to select the class with the highest probability, and the API returns the predicted label, confidence score, and health status.
