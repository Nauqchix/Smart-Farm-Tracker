# Plant Disease Classification (CNN)

This project contains a custom Convolutional Neural Network (CNN) built in PyTorch to classify 38 different plant diseases and healthy states using leaf images. 

It is adapted from the `pytorch-plant-disease-cnn-98-accuracy.ipynb` Kaggle notebook for local execution on Windows.

## Prerequisites

Ensure you have Python 3.9+ installed. You also need to install the required libraries. 

Open PowerShell and install the dependencies:

```powershell
# Install PyTorch with CUDA support (Recommended for NVIDIA GPUs)
pip install torch torchvision --index-url https://download.pytorch.org/whl/cu121

# Install remaining libraries
pip install tqdm scikit-learn seaborn matplotlib numpy
```

## Dataset Setup

The script expects the **New Plant Diseases Dataset (Augmented)** to be extracted locally. 
By default, the script looks for the dataset at the following path:
`C:\Users\Admin\Downloads\plant-disease\New Plant Diseases Dataset(Augmented)\New Plant Diseases Dataset(Augmented)`

Ensure your folder structure looks like this:
```
Downloads/
├── plant-disease/
│   └── New Plant Diseases Dataset(Augmented)/
│       └── New Plant Diseases Dataset(Augmented)/
│           ├── train/       <-- Contains 38 subfolders (one per class)
│           └── valid/       <-- Contains 38 subfolders (one per class)
└── train_plant_disease_test.py
```

## How to Run

To start the training and testing process, open PowerShell, navigate to the `Downloads` directory, and run the Python script:

```powershell
cd C:\Users\Admin\Downloads
python train_plant_disease_test.py
```

## Customization

You can open `train_plant_disease_test.py` in any text editor to modify the parameters:

- **Epochs:** Currently set to `epochs = 1` for quick testing. To fully train the model (to ~98% accuracy), change this to `epochs = 15` (Line 66).
- **Batch Size:** Currently set to `32` to accommodate a 4GB VRAM GPU (like the RTX 3050 Laptop GPU). If you upgrade to a GPU with more VRAM, you can increase this to `64` for faster training (Line 50 & 51).
- **Data Path:** If you move the dataset folder, update the `path` variable accordingly (Line 45).

## Expected Outputs

Once the script finishes executing, it will generate two files in the directory where you ran the script:

1. **`plant_disease_[accuracy].pth`**: The saved PyTorch model weights (e.g., `plant_disease_83.pth`).
2. **`confusion_matrix.png`**: A visualization of the model's accuracy per class on the validation set.
