"""
EduLens AI - Model Evaluation Script
======================================
Usage: python evaluate.py
Shows accuracy per class and overall performance.
"""

import torch
import torch.nn as nn
from torchvision import datasets, transforms, models
from torch.utils.data import DataLoader
from pathlib import Path
import json

DATASET_DIR = "models/dataset"
MODEL_PATH  = "models/best_model.pth"
BATCH_SIZE  = 32
IMG_SIZE    = 224

CLASSES = [
    'math_equation', 'physics_diagram', 'chemistry_structure',
    'biology_cell', 'history_timeline', 'geography_map',
    'english_grammar', 'coding_snippet', 'handwritten_notes',
    'textbook_page'
]

device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')

transform = transforms.Compose([
    transforms.Resize(IMG_SIZE + 32),
    transforms.CenterCrop(IMG_SIZE),
    transforms.ToTensor(),
    transforms.Normalize(mean=[0.485, 0.456, 0.406],
                         std=[0.229, 0.224, 0.225])
])

def evaluate():
    print("=" * 55)
    print("   EduLens AI — Model Evaluation")
    print("=" * 55)

    if not Path(MODEL_PATH).exists():
        print(f"❌ No model found at {MODEL_PATH}. Train first with: python train.py")
        return

    # Load dataset
    dataset = datasets.ImageFolder(DATASET_DIR, transform=transform)
    loader  = DataLoader(dataset, batch_size=BATCH_SIZE, shuffle=False, num_workers=0)
    num_classes = len(dataset.classes)

    # Load model
    model = models.mobilenet_v2(weights=None)
    model.classifier[1] = nn.Linear(model.last_channel, num_classes)
    model.load_state_dict(torch.load(MODEL_PATH, map_location=device))
    model = model.to(device)
    model.eval()
    print(f"✅ Loaded model from {MODEL_PATH}\n")

    # Per-class tracking
    class_correct = {cls: 0 for cls in dataset.classes}
    class_total   = {cls: 0 for cls in dataset.classes}
    total_correct = 0
    total_samples = 0

    with torch.no_grad():
        for inputs, labels in loader:
            inputs, labels = inputs.to(device), labels.to(device)
            outputs = model(inputs)
            _, predicted = outputs.max(1)

            for label, pred in zip(labels, predicted):
                cls = dataset.classes[label.item()]
                class_total[cls]   += 1
                total_samples      += 1
                if label == pred:
                    class_correct[cls] += 1
                    total_correct      += 1

    # Print results
    print(f"{'Class':<25} {'Images':>8} {'Correct':>8} {'Accuracy':>10}")
    print("-" * 55)
    for cls in dataset.classes:
        acc = 100. * class_correct[cls] / class_total[cls] if class_total[cls] > 0 else 0
        bar = "█" * int(acc / 5)
        print(f"{cls:<25} {class_total[cls]:>8} {class_correct[cls]:>8} {acc:>9.1f}%  {bar}")

    overall = 100. * total_correct / total_samples if total_samples > 0 else 0
    print("-" * 55)
    print(f"{'OVERALL':<25} {total_samples:>8} {total_correct:>8} {overall:>9.1f}%")

    # Load training stats if available
    stats_path = Path("models/training_stats.json")
    if stats_path.exists():
        with open(stats_path) as f:
            stats = json.load(f)
        print(f"\n📈 Best validation accuracy during training: {stats['best_val_acc']:.1f}%")


if __name__ == "__main__":
    evaluate()