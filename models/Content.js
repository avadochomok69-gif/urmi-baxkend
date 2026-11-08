import mongoose from 'mongoose';

const contentSchema = new mongoose.Schema({
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
    type: String
  },
  descriptionBn: {
    type: String
  },
  type: {
    type: String,
    enum: ['photo', 'video'],
    required: true
  },
  category: {
    type: String,
    enum: ['bold', 'premium', 'exclusive', 'custom'],
    default: 'premium'
  },
  files: [{
    url: {
      type: String,
      required: true
    },
    thumbnail: String,
    filename: String,
    size: Number,
    mimeType: String
  }],
  thumbnail: {
    type: String
  },
  preview: {
    type: String
  },
  isPublished: {
    type: Boolean,
    default: false
  },
  packages: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Package'
  }],
  views: {
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

contentSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

export default mongoose.model('Content', contentSchema);
