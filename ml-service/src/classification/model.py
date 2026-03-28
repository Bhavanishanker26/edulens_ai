import torch
import torch.nn as nn
from torchvision import models, transforms
from PIL import Image
import io
import os

class ImageClassifier:
    def __init__(self, num_classes=10, model_path=None):
        self.device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')

        # ✅ Updated: no deprecation warning
        self.model = models.mobilenet_v2(weights=models.MobileNet_V2_Weights.IMAGENET1K_V1)
        self.model.classifier[1] = nn.Linear(self.model.last_channel, num_classes)

        if model_path and os.path.exists(model_path):
            try:
                self.model.load_state_dict(torch.load(model_path, map_location=self.device))
                print(f"✅ Loaded trained model from {model_path}")
            except Exception as e:
                print(f"⚠️  Could not load model: {e}")
                print("   Using pretrained ImageNet weights instead")
        else:
            print(f"⚠️  No trained model at {model_path}")
            print("   Run: python train.py  to train your model")
            print("   Using ImageNet weights for now (lower accuracy)")

        self.model.to(self.device)
        self.model.eval()

        self.transform = transforms.Compose([
            transforms.Resize(256),
            transforms.CenterCrop(224),
            transforms.ToTensor(),
            transforms.Normalize(mean=[0.485, 0.456, 0.406],
                                 std=[0.229, 0.224, 0.225])
        ])

        self.classes = [
            'math_equation', 'physics_diagram', 'chemistry_structure',
            'biology_cell', 'history_timeline', 'geography_map',
            'english_grammar', 'coding_snippet', 'handwritten_notes',
            'textbook_page'
        ]

    def predict(self, image_bytes):
        image = Image.open(io.BytesIO(image_bytes)).convert('RGB')
        input_tensor = self.transform(image).unsqueeze(0).to(self.device)

        with torch.no_grad():
            output = self.model(input_tensor)
            probabilities = torch.nn.functional.softmax(output[0], dim=0)
            confidence, predicted = torch.max(probabilities, 0)

        return {
            'class': self.classes[predicted.item()],
            'confidence': float(confidence.item()),   # ✅ cast to float (no numpy int32 issue)
            'all_probs': {
                cls: float(prob.item())
                for cls, prob in zip(self.classes, probabilities)
            }
        }