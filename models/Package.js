import mongoose from 'mongoose';

const packageSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  titleBn: {
    type: String,
    trim: true
  },
  description: {
    type: String,
    required: true
  },
  descriptionBn: {
    type: String
  },
  category: {
    type: String,
    required: true,
    enum: ['calling', 'photo', 'video', 'custom']
  },
  price: {
    type: Number,
    required: true,
    min: 0
  },
  duration: {
    type: String, // e.g., "1 Hour", "2 Hours"
  },
  thumbnail: {
    type: String
  },
  preview: {
    type: String
  },
  isActive: {
    type: Boolean,
    default: true
  },
  features: [{
    type: String
  }],
  contentItems: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Content'
  }],
  itemCount: {
    type: Number,
    default: 0
  },
  sortOrder: {
    type: Number,
    default: 0
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

packageSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

export default mongoose.model('Package', packageSchema);
