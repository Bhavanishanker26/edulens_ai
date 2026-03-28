"""
EduLens AI - Model Training Script
====================================
Usage:
  1. Put images in ml-service/models/dataset/<class_name>/
  2. Run: python train.py
  3. Model saved to ml-service/models/best_model.pth
"""

import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import DataLoader, random_split
from torchvision import datasets, transforms, models
import os
import json
import time
from pathlib import Path

# ─── Config ──────────────────────────────────────────────────────────────────

DATASET_DIR   = "models/dataset"       # Put your images here
MODEL_SAVE    = "models/best_model.pth"
STATS_SAVE    = "models/training_stats.json"

NUM_EPOCHS    = 20
BATCH_SIZE    = 32
LEARNING_RATE = 0.001
VAL_SPLIT     = 0.2                    # 20% for validation
IMG_SIZE      = 224
NUM_WORKERS   = 0                      # Set to 4 if on Linux/Mac

CLASSES = [
    'math_equation',
    'physics_diagram',
    'chemistry_structure',
    'biology_cell',
    'history_timeline',
    'geography_map',
    'english_grammar',
    'coding_snippet',
    'handwritten_notes',
    'textbook_page'
]

# ─── Device ──────────────────────────────────────────────────────────────────

device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
print(f"🖥️  Using device: {device}")
if torch.cuda.is_available():
    print(f"   GPU: {torch.cuda.get_device_name(0)}")

# ─── Data Transforms ─────────────────────────────────────────────────────────

train_transform = transforms.Compose([
    transforms.Resize((IMG_SIZE + 32, IMG_SIZE + 32)),
    transforms.RandomCrop(IMG_SIZE),
    transforms.RandomHorizontalFlip(),
    transforms.RandomRotation(10),
    transforms.ColorJitter(brightness=0.2, contrast=0.2, saturation=0.1),
    transforms.ToTensor(),
    transforms.Normalize(mean=[0.485, 0.456, 0.406],
                         std=[0.229, 0.224, 0.225])
])

val_transform = transforms.Compose([
    transforms.Resize(IMG_SIZE + 32),
    transforms.CenterCrop(IMG_SIZE),
    transforms.ToTensor(),
    transforms.Normalize(mean=[0.485, 0.456, 0.406],
                         std=[0.229, 0.224, 0.225])
])

# ─── Dataset Check ───────────────────────────────────────────────────────────

def check_dataset():
    dataset_path = Path(DATASET_DIR)
    if not dataset_path.exists():
        print(f"\n❌ Dataset folder not found: {DATASET_DIR}")
        print("\n📁 Please create this structure:")
        for cls in CLASSES:
            print(f"   models/dataset/{cls}/  (add 100-200 images here)")
        return False

    print(f"\n📊 Dataset Summary:")
    total = 0
    missing = []
    for cls in CLASSES:
        cls_path = dataset_path / cls
        if cls_path.exists():
            count = len(list(cls_path.glob("*.jpg")) +
                        list(cls_path.glob("*.jpeg")) +
                        list(cls_path.glob("*.png")) +
                        list(cls_path.glob("*.webp")))
            status = "✅" if count >= 50 else "⚠️ (need more images)"
            print(f"   {status} {cls}: {count} images")
            total += count
        else:
            print(f"   ❌ {cls}: folder missing")
            missing.append(cls)

    print(f"\n   Total images: {total}")

    if missing:
        print(f"\n⚠️  Missing folders: {missing}")
        print("   Create them and add images before training.")
        return False

    if total < 100:
        print("\n❌ Not enough images to train. Need at least 50 per class.")
        return False

    return True

# ─── Model Setup ─────────────────────────────────────────────────────────────

def build_model(num_classes):
    print("\n🏗️  Building MobileNetV2 model (transfer learning)...")
    model = models.mobilenet_v2(weights=models.MobileNet_V2_Weights.IMAGENET1K_V1)

    # Freeze all base layers
    for param in model.parameters():
        param.requires_grad = False

    # Replace classifier — only this will be trained initially
    model.classifier[1] = nn.Linear(model.last_channel, num_classes)

    # Unfreeze last 3 conv blocks for fine-tuning
    for param in model.features[-3:].parameters():
        param.requires_grad = True

    model = model.to(device)
    print(f"   Trainable params: {sum(p.numel() for p in model.parameters() if p.requires_grad):,}")
    return model

# ─── Training Loop ───────────────────────────────────────────────────────────

def train_epoch(model, loader, criterion, optimizer):
    model.train()
    running_loss = 0.0
    correct = 0
    total = 0

    for batch_idx, (inputs, labels) in enumerate(loader):
        inputs, labels = inputs.to(device), labels.to(device)

        optimizer.zero_grad()
        outputs = model(inputs)
        loss = criterion(outputs, labels)
        loss.backward()
        optimizer.step()

        running_loss += loss.item()
        _, predicted = outputs.max(1)
        total += labels.size(0)
        correct += predicted.eq(labels).sum().item()

        if (batch_idx + 1) % 10 == 0:
            print(f"   Batch {batch_idx+1}/{len(loader)} | "
                  f"Loss: {running_loss/(batch_idx+1):.3f} | "
                  f"Acc: {100.*correct/total:.1f}%", end='\r')

    return running_loss / len(loader), 100. * correct / total


def val_epoch(model, loader, criterion):
    model.eval()
    running_loss = 0.0
    correct = 0
    total = 0

    with torch.no_grad():
        for inputs, labels in loader:
            inputs, labels = inputs.to(device), labels.to(device)
            outputs = model(inputs)
            loss = criterion(outputs, labels)

            running_loss += loss.item()
            _, predicted = outputs.max(1)
            total += labels.size(0)
            correct += predicted.eq(labels).sum().item()

    return running_loss / len(loader), 100. * correct / total

# ─── Main ────────────────────────────────────────────────────────────────────

def main():
    print("=" * 55)
    print("   EduLens AI — Model Training")
    print("=" * 55)

    # Check dataset
    if not check_dataset():
        return

    # Load full dataset with train transform first
    full_dataset = datasets.ImageFolder(DATASET_DIR, transform=train_transform)
    num_classes = len(full_dataset.classes)
    print(f"\n✅ Found {num_classes} classes: {full_dataset.classes}")

    # Verify class order matches CLASSES list
    if full_dataset.classes != sorted(CLASSES):
        print(f"\n⚠️  Class order mismatch!")
        print(f"   Found:    {full_dataset.classes}")
        print(f"   Expected: {sorted(CLASSES)}")

    # Train/val split
    val_size = int(len(full_dataset) * VAL_SPLIT)
    train_size = len(full_dataset) - val_size
    train_dataset, val_dataset = random_split(full_dataset, [train_size, val_size])

    # Apply val transform to val set
    val_dataset.dataset.transform = val_transform

    train_loader = DataLoader(train_dataset, batch_size=BATCH_SIZE,
                              shuffle=True, num_workers=NUM_WORKERS)
    val_loader   = DataLoader(val_dataset, batch_size=BATCH_SIZE,
                              shuffle=False, num_workers=NUM_WORKERS)

    print(f"\n📦 Train: {train_size} | Val: {val_size}")

    # Build model
    model = build_model(num_classes)
    criterion = nn.CrossEntropyLoss()
    optimizer = optim.Adam(filter(lambda p: p.requires_grad, model.parameters()),
                           lr=LEARNING_RATE)
    scheduler = optim.lr_scheduler.ReduceLROnPlateau(optimizer, patience=3, factor=0.5)

    # Training
    print(f"\n🚀 Training for {NUM_EPOCHS} epochs...\n")
    best_val_acc = 0.0
    stats = []
    os.makedirs("models", exist_ok=True)

    for epoch in range(NUM_EPOCHS):
        start = time.time()

        train_loss, train_acc = train_epoch(model, train_loader, criterion, optimizer)
        val_loss, val_acc     = val_epoch(model, val_loader, criterion)
        scheduler.step(val_loss)

        elapsed = time.time() - start
        print(f"\nEpoch {epoch+1:02d}/{NUM_EPOCHS} | "
              f"Train: {train_acc:.1f}% | "
              f"Val: {val_acc:.1f}% | "
              f"Loss: {val_loss:.3f} | "
              f"Time: {elapsed:.1f}s")

        stats.append({
            'epoch': epoch + 1,
            'train_acc': round(train_acc, 2),
            'val_acc': round(val_acc, 2),
            'train_loss': round(train_loss, 4),
            'val_loss': round(val_loss, 4)
        })

        # Save best model
        if val_acc > best_val_acc:
            best_val_acc = val_acc
            torch.save(model.state_dict(), MODEL_SAVE)
            print(f"   💾 Saved best model (val_acc={val_acc:.1f}%)")

    # Save training stats
    with open(STATS_SAVE, 'w') as f:
        json.dump({'best_val_acc': best_val_acc, 'epochs': stats}, f, indent=2)

    print(f"\n{'='*55}")
    print(f"✅ Training complete!")
    print(f"   Best validation accuracy: {best_val_acc:.1f}%")
    print(f"   Model saved to: {MODEL_SAVE}")
    print(f"   Stats saved to: {STATS_SAVE}")
    print(f"{'='*55}")


if __name__ == "__main__":
    main()