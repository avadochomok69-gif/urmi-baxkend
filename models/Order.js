import mongoose from 'mongoose';

const orderSchema = new mongoose.Schema({
  customer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  package: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Package',
    required: true
  },
  customerInfo: {
    name: {
      type: String,
      required: true
    },
    whatsapp: String,
    telegram: String,
    email: String,
    phone: String
  },
  paymentInfo: {
    method: {
      type: String,
      enum: ['bkash', 'nagad'],
      required: true
    },
    transactionId: {
      type: String,
      required: true
    },
    amount: {
      type: Number,
      required: true
    }
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'completed'],
    default: 'pending'
  },
  bookingInfo: {
    scheduledDate: Date,
    scheduledTime: String,
    bookingStatus: {
      type: String,
      enum: ['pending', 'confirmed', 'completed', 'cancelled'],
      default: 'pending'
    },
    notes: String
  },
  adminNotes: {
    type: String
  },
  approvedAt: Date,
  rejectedAt: Date,
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

orderSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

export default mongoose.model('Order', orderSchema);
