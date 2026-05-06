import torch.nn as nn
from torchvision import transforms, datasets
from torch.utils.data import DataLoader
import torch
from tqdm import tqdm
import random
import numpy as np
from sklearn.metrics import confusion_matrix
import seaborn as sns
import matplotlib.pyplot as plt
import os

class cnn(nn.Module):
    def __init__(self):
        super().__init__()
        self.conv = nn.Sequential(
            nn.Conv2d(in_channels=3, out_channels=16, kernel_size=3, padding=1),
            nn.BatchNorm2d(16),
            nn.ReLU(),
            nn.MaxPool2d(kernel_size=2, stride=2),

            nn.Conv2d(in_channels=16, out_channels=32, kernel_size=3, padding=1),
            nn.BatchNorm2d(32),
            nn.ReLU(),
            nn.MaxPool2d(kernel_size=2, stride=2),

            nn.Conv2d(in_channels=32, out_channels=64, kernel_size=3, padding=1),
            nn.BatchNorm2d(64),
            nn.ReLU(),
            nn.MaxPool2d(kernel_size=2, stride=2),

            nn.Conv2d(in_channels=64, out_channels=128, kernel_size=3, padding=1),
            nn.BatchNorm2d(128),
            nn.ReLU(),
            nn.MaxPool2d(kernel_size=2, stride=2),

            nn.Conv2d(in_channels=128, out_channels=256, kernel_size=3, padding=1),
            nn.BatchNorm2d(256),
            nn.ReLU(),
            nn.MaxPool2d(kernel_size=2, stride=2),
        )
        self.head = nn.Sequential(
            nn.Flatten(),
            nn.Dropout(0.5),
            nn.Linear(8*8*256, 38)
        )

    def forward(self, x):
        x = self.conv(x)
        x = self.head(x)
        return x

def main():
    if torch.cuda.is_available():
        device = torch.device("cuda")
    elif torch.backends.mps.is_available():
        device = torch.device("mps")
    else:
        device = torch.device("cpu")
        
    print(f"Using device {device}")

    t = transforms.Compose([
        transforms.Resize((256, 256)),
        transforms.ToTensor(),
        transforms.Normalize(mean=[0.5, 0.5, 0.5], std=[0.5, 0.5, 0.5])
    ])

    path = r"C:\Users\Admin\Downloads\plant-disease\New Plant Diseases Dataset(Augmented)\New Plant Diseases Dataset(Augmented)"

    print("Loading dataset from:", path)
    train = datasets.ImageFolder(os.path.join(path, "train"), transform=t)
    test = datasets.ImageFolder(os.path.join(path, "valid"), transform=t)

    # Reduced batch size to 32 for 4GB VRAM. num_workers=0 to avoid Windows multiprocessing issues in simple scripts
    train_loader = DataLoader(train, batch_size=32, shuffle=True, num_workers=0, pin_memory=True)
    test_loader = DataLoader(test, batch_size=32, shuffle=False, num_workers=0, pin_memory=True)
    print(f"Dataset loaded. Training samples: {len(train)}, Validation samples: {len(test)}")

    model = cnn()

    if torch.cuda.device_count() > 1:
        model = nn.DataParallel(model)

    model = model.to(device)

    criterion = nn.CrossEntropyLoss()
    optimizer = torch.optim.AdamW(model.parameters(), lr=0.001, weight_decay=0.01)

    epochs = 15 # Running 15 epochs for full training
    print(f"Starting training run for {epochs} epochs...")
    for epoch in range(epochs):
        loop = tqdm(train_loader, desc=f"Epoch {epoch+1}/{epochs}", leave=True)
        total = 0
        correct = 0
        for features, labels in loop:
            features, labels = features.to(device), labels.to(device)
            optimizer.zero_grad()

            pred = model(features)
            loss = criterion(pred, labels)
            loss.backward()
            optimizer.step()

            _,pred_classes = torch.max(pred, 1)
            total += labels.size(0)
            correct += (pred_classes == labels).sum().item()

            loop.set_postfix(loss=loss.item(), acc=(correct/total)*100)

    print("Testing on validation set...")
    all_preds = []
    all_labels = []
    correct = 0
    total = 0
    model.eval()
    with torch.no_grad():
        for features, labels in tqdm(test_loader, desc="Testing"):
            features, labels = features.to(device), labels.to(device)
            preds = model(features)
            _, preds = torch.max(preds, 1)
            total += labels.size(0)
            correct += (preds == labels).sum().item()
            all_preds.extend(preds.cpu().numpy())
            all_labels.extend(labels.cpu().numpy())

    accuracy = (correct/total)*100
    print(f"Test accuracy: {accuracy:.2f}%")
    
    # Save the confusion matrix plot instead of plt.show()
    cm = confusion_matrix(all_labels, all_preds)
    plt.figure(figsize=(20, 20))
    sns.heatmap(cm, annot=False, fmt='d', cmap='Blues')
    plt.xlabel("Predicted")
    plt.ylabel("Actual")
    plt.savefig("confusion_matrix.png")
    print("Confusion matrix saved as confusion_matrix.png")

    # Save the model
    model_name = f"plant_disease_{int(accuracy)}.pth"
    torch.save(model.state_dict(), model_name)
    print(f"Model saved as {model_name}")

if __name__ == '__main__':
    main()
