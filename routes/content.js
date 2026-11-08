import express from 'express';
import supabase from '../db/supabase.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

export const mapContent = (c) => {
  if (!c) return null;
  return {
    ...c,
    id: c.id,
    _id: c.id,
    titleBn: c.title_bn || c.titleBn,
    descriptionBn: c.description_bn || c.descriptionBn,
    isPublished: c.is_published !== undefined ? c.is_published : c.isPublished,
    createdAt: c.created_at || c.createdAt,
    updatedAt: c.updated_at || c.updatedAt
  };
};

// Get user's accessible content
router.get('/my-content', protect, async (req, res) => {
  try {
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('accessible_content')
      .eq('id', req.user.id)
      .single();

    if (userError) throw userError;

    const accessible = user?.accessible_content || [];
    const contentIds = accessible.map(a => a.contentId).filter(Boolean);

    let contentList = [];
    if (contentIds.length > 0) {
      const { data: contents, error: contentError } = await supabase
        .from('content')
        .select('*')
        .in('id', contentIds);

      if (contentError) throw contentError;

      const contentMap = new Map();
      (contents || []).forEach(c => contentMap.set(c.id, mapContent(c)));

      contentList = accessible
        .filter(item => contentMap.has(item.contentId))
        .map(item => ({
          content: contentMap.get(item.contentId),
          packageId: item.packageId,
          grantedAt: item.grantedAt
        }));
    }

    res.json({
      success: true,
      count: contentList.length,
      content: contentList
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch content',
      error: error.message
    });
  }
});

// Get content by ID (if user has access)
router.get('/:id', protect, async (req, res) => {
  try {
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('role, accessible_content')
      .eq('id', req.user.id)
      .single();

    if (userError) throw userError;

    const accessible = user?.accessible_content || [];
    const hasAccess = accessible.some(item => item.contentId === req.params.id);

    if (!hasAccess && user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'You do not have access to this content'
      });
    }

    const { data: content, error: contentError } = await supabase
      .from('content')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (contentError || !content) {
      return res.status(404).json({
        success: false,
        message: 'Content not found'
      });
    }

    // Increment view count
    const newViews = (content.views || 0) + 1;
    await supabase
      .from('content')
      .update({ views: newViews, updated_at: new Date().toISOString() })
      .eq('id', req.params.id);

    res.json({
      success: true,
      content: mapContent({ ...content, views: newViews })
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch content',
      error: error.message
    });
  }
});

export default router;
