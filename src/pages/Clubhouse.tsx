import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Plus, ThumbsUp, MessageCircle, Trash2, Image as ImageIcon, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import venueLogo from "@/assets/venue-logo.png";
import { useTenant } from "@/config/tenant";
import { usePricing } from "@/hooks/usePricing";
import { isDefaultTier } from "@/lib/tier-config";

interface Post {
  id: string;
  user_id: string;
  title: string;
  content: string;
  image_url: string | null;
  upvote_count: number;
  created_at: string;
  author_name?: string;
  comment_count?: number;
  has_upvoted?: boolean;
}

interface Comment {
  id: string;
  post_id: string;
  user_id: string;
  content: string;
  created_at: string;
  author_name?: string;
}

type MembershipTier = string;

const Clubhouse = () => {
  const { tenant } = useTenant();
  const { pricing } = usePricing();
  const { user, isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loadingPosts, setLoadingPosts] = useState(true);
  const [membershipTier, setMembershipTier] = useState<MembershipTier>("visitor");
  const [isAdmin, setIsAdmin] = useState(false);
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loadingComments, setLoadingComments] = useState(false);
  const [newComment, setNewComment] = useState("");
  const [submittingComment, setSubmittingComment] = useState(false);
  
  // Create post state
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newPostTitle, setNewPostTitle] = useState("");
  const [newPostContent, setNewPostContent] = useState("");
  const [newPostImage, setNewPostImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [submittingPost, setSubmittingPost] = useState(false);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      navigate("/");
    }
  }, [isAuthenticated, isLoading, navigate]);

  useEffect(() => {
    const fetchProfile = async () => {
      if (!user) return;
      const { data } = await supabase
        .from("profiles")
        .select("membership_tier")
        .eq("user_id", user.id)
        .single();
      if (data?.membership_tier) {
        setMembershipTier(data.membership_tier as MembershipTier);
      }
    };
    fetchProfile();
  }, [user]);

  useEffect(() => {
    const checkAdminStatus = async () => {
      if (!user) return;
      const { data } = await supabase.rpc('has_role', { 
        _user_id: user.id, 
        _role: 'admin' 
      });
      setIsAdmin(!!data);
    };
    checkAdminStatus();
  }, [user]);

  useEffect(() => {
    if (isDefaultTier(pricing, membershipTier)) return;
    fetchPosts();
  }, [user, membershipTier, pricing]);

  const fetchPosts = async () => {
    if (!user) return;
    setLoadingPosts(true);
    try {
      // Fetch posts
      const { data: postsData, error: postsError } = await supabase
        .from("clubhouse_posts")
        .select("*")
        .order("created_at", { ascending: false });

      if (postsError) throw postsError;

      // Fetch author names and counts
      const postsWithDetails = await Promise.all(
        (postsData || []).map(async (post) => {
          // Get author name
          const { data: profile } = await supabase
            .from("profiles")
            .select("first_name, last_name")
            .eq("user_id", post.user_id)
            .single();

          // Get comment count
          const { count: commentCount } = await supabase
            .from("clubhouse_comments")
            .select("*", { count: "exact", head: true })
            .eq("post_id", post.id);

          // Check if user has upvoted
          const { data: upvoteData } = await supabase
            .from("clubhouse_upvotes")
            .select("id")
            .eq("post_id", post.id)
            .eq("user_id", user.id)
            .maybeSingle();

          return {
            ...post,
            author_name: profile ? `${profile.first_name} ${profile.last_name}` : "Unknown",
            comment_count: commentCount || 0,
            has_upvoted: !!upvoteData
          };
        })
      );

      setPosts(postsWithDetails);
    } catch (error) {
      console.error("Error fetching posts:", error);
      toast.error("Failed to load posts");
    } finally {
      setLoadingPosts(false);
    }
  };

  const fetchComments = async (postId: string) => {
    setLoadingComments(true);
    try {
      const { data: commentsData, error } = await supabase
        .from("clubhouse_comments")
        .select("*")
        .eq("post_id", postId)
        .order("created_at", { ascending: true });

      if (error) throw error;

      const commentsWithAuthors = await Promise.all(
        (commentsData || []).map(async (comment) => {
          const { data: profile } = await supabase
            .from("profiles")
            .select("first_name, last_name")
            .eq("user_id", comment.user_id)
            .single();

          return {
            ...comment,
            author_name: profile ? `${profile.first_name} ${profile.last_name}` : "Unknown"
          };
        })
      );

      setComments(commentsWithAuthors);
    } catch (error) {
      console.error("Error fetching comments:", error);
    } finally {
      setLoadingComments(false);
    }
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        toast.error("Image must be less than 5MB");
        return;
      }
      setNewPostImage(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const removeImage = () => {
    setNewPostImage(null);
    setImagePreview(null);
  };

  const handleCreatePost = async () => {
    if (!user || !newPostTitle.trim() || !newPostContent.trim()) {
      toast.error("Please fill in all required fields");
      return;
    }

    setSubmittingPost(true);
    try {
      let imageUrl = null;

      // Upload image if exists
      if (newPostImage) {
        const fileExt = newPostImage.name.split('.').pop();
        const fileName = `${user.id}/${Date.now()}.${fileExt}`;
        
        const { error: uploadError } = await supabase.storage
          .from("clubhouse-images")
          .upload(fileName, newPostImage);

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from("clubhouse-images")
          .getPublicUrl(fileName);

        imageUrl = publicUrl;
      }

      const { error } = await supabase
        .from("clubhouse_posts")
        .insert({
          user_id: user.id,
          title: newPostTitle.trim(),
          content: newPostContent.trim(),
          image_url: imageUrl
        });

      if (error) throw error;

      toast.success("Post created!");
      setCreateDialogOpen(false);
      setNewPostTitle("");
      setNewPostContent("");
      setNewPostImage(null);
      setImagePreview(null);
      fetchPosts();
    } catch (error) {
      console.error("Error creating post:", error);
      toast.error("Failed to create post");
    } finally {
      setSubmittingPost(false);
    }
  };

  const handleUpvote = async (postId: string, hasUpvoted: boolean) => {
    if (!user) return;

    try {
      if (hasUpvoted) {
        // Remove upvote
        await supabase
          .from("clubhouse_upvotes")
          .delete()
          .eq("post_id", postId)
          .eq("user_id", user.id);

        // Decrement count
        await supabase
          .from("clubhouse_posts")
          .update({ upvote_count: posts.find(p => p.id === postId)!.upvote_count - 1 })
          .eq("id", postId);
      } else {
        // Add upvote
        await supabase
          .from("clubhouse_upvotes")
          .insert({ post_id: postId, user_id: user.id });

        // Increment count
        await supabase
          .from("clubhouse_posts")
          .update({ upvote_count: posts.find(p => p.id === postId)!.upvote_count + 1 })
          .eq("id", postId);
      }

      // Update local state
      setPosts(posts.map(p => 
        p.id === postId 
          ? { ...p, has_upvoted: !hasUpvoted, upvote_count: p.upvote_count + (hasUpvoted ? -1 : 1) }
          : p
      ));

      if (selectedPost?.id === postId) {
        setSelectedPost({
          ...selectedPost,
          has_upvoted: !hasUpvoted,
          upvote_count: selectedPost.upvote_count + (hasUpvoted ? -1 : 1)
        });
      }
    } catch (error) {
      console.error("Error toggling upvote:", error);
    }
  };

  const handleAddComment = async () => {
    if (!user || !selectedPost || !newComment.trim()) return;

    setSubmittingComment(true);
    try {
      const { error } = await supabase
        .from("clubhouse_comments")
        .insert({
          post_id: selectedPost.id,
          user_id: user.id,
          content: newComment.trim()
        });

      if (error) throw error;

      setNewComment("");
      fetchComments(selectedPost.id);
      
      // Update comment count in posts list
      setPosts(posts.map(p => 
        p.id === selectedPost.id 
          ? { ...p, comment_count: (p.comment_count || 0) + 1 }
          : p
      ));
      setSelectedPost({
        ...selectedPost,
        comment_count: (selectedPost.comment_count || 0) + 1
      });
    } catch (error) {
      console.error("Error adding comment:", error);
      toast.error("Failed to add comment");
    } finally {
      setSubmittingComment(false);
    }
  };

  const handleDeletePost = async (postId: string) => {
    if (!confirm("Are you sure you want to delete this post?")) return;

    try {
      const { error } = await supabase
        .from("clubhouse_posts")
        .delete()
        .eq("id", postId);

      if (error) throw error;

      toast.success("Post deleted");
      setSelectedPost(null);
      fetchPosts();
    } catch (error) {
      console.error("Error deleting post:", error);
      toast.error("Failed to delete post");
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    if (!selectedPost) return;

    try {
      const { error } = await supabase
        .from("clubhouse_comments")
        .delete()
        .eq("id", commentId);

      if (error) throw error;

      fetchComments(selectedPost.id);
      
      // Update comment count
      setPosts(posts.map(p => 
        p.id === selectedPost.id 
          ? { ...p, comment_count: Math.max(0, (p.comment_count || 0) - 1) }
          : p
      ));
      setSelectedPost({
        ...selectedPost,
        comment_count: Math.max(0, (selectedPost.comment_count || 0) - 1)
      });
    } catch (error) {
      console.error("Error deleting comment:", error);
      toast.error("Failed to delete comment");
    }
  };

  const openPostDetail = (post: Post) => {
    setSelectedPost(post);
    fetchComments(post.id);
  };

  const isMember = !isDefaultTier(pricing, membershipTier);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!isMember) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <header className="bg-primary py-4 px-6 flex items-center gap-4 safe-area-top">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/dashboard")}
            className="text-primary-foreground hover:bg-primary-foreground/10"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <img src={venueLogo} alt={tenant.venue_name} className="h-10 w-auto" />
        </header>
        <main className="flex-1 flex items-center justify-center p-6">
          <Card className="max-w-md text-center">
            <CardContent className="pt-6">
              <h2 className="text-xl font-semibold mb-2">Members Only</h2>
              <p className="text-muted-foreground mb-4">
                Upgrade your membership to access the {tenant.venue_name} Clubhouse community.
              </p>
              <Button onClick={() => navigate("/membership")}>
                View Memberships
              </Button>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="bg-primary py-4 px-6 flex items-center justify-between safe-area-top">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/dashboard")}
            className="text-primary-foreground hover:bg-primary-foreground/10"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <img src={venueLogo} alt={tenant.venue_name} className="h-10 w-auto" />
        </div>
        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-accent text-accent-foreground hover:bg-accent/90">
              <Plus className="h-4 w-4 mr-2" />
              New Post
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Create a Post</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="title">Title</Label>
                <Input
                  id="title"
                  value={newPostTitle}
                  onChange={(e) => setNewPostTitle(e.target.value)}
                  placeholder="What's on your mind?"
                  maxLength={100}
                />
              </div>
              <div>
                <Label htmlFor="content">Content</Label>
                <Textarea
                  id="content"
                  value={newPostContent}
                  onChange={(e) => setNewPostContent(e.target.value)}
                  placeholder="Share your thoughts..."
                  rows={4}
                  maxLength={2000}
                />
              </div>
              <div>
                <Label>Image (optional)</Label>
                {imagePreview ? (
                  <div className="relative mt-2">
                    <img
                      src={imagePreview}
                      alt="Preview"
                      className="w-full h-48 object-cover rounded-lg"
                    />
                    <Button
                      variant="destructive"
                      size="icon"
                      className="absolute top-2 right-2"
                      onClick={removeImage}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <label className="mt-2 flex items-center justify-center w-full h-32 border-2 border-dashed border-border rounded-lg cursor-pointer hover:border-accent transition-colors">
                    <div className="flex flex-col items-center text-muted-foreground">
                      <ImageIcon className="h-8 w-8 mb-2" />
                      <span className="text-sm">Click to upload image</span>
                    </div>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleImageChange}
                    />
                  </label>
                )}
              </div>
              <Button
                className="w-full"
                onClick={handleCreatePost}
                disabled={submittingPost || !newPostTitle.trim() || !newPostContent.trim()}
              >
                {submittingPost ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Creating...</>
                ) : (
                  "Create Post"
                )}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </header>

      {/* Main content */}
      <main className="flex-1 p-6">
        <div className="container max-w-3xl mx-auto">
          <h1 className="font-display text-4xl text-primary mb-2">{tenant.venue_name.toUpperCase()} CLUBHOUSE</h1>
          <p className="text-muted-foreground mb-8">Connect with fellow members</p>

          {loadingPosts ? (
            <div className="text-center py-12">
              <Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
            </div>
          ) : posts.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <p className="text-muted-foreground">No posts yet. Be the first to share something!</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {posts.map((post) => (
                <Card
                  key={post.id}
                  className="cursor-pointer hover:shadow-md transition-shadow"
                  onClick={() => openPostDetail(post)}
                >
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-lg">{post.title}</CardTitle>
                        <p className="text-sm text-muted-foreground">
                          {post.author_name} • {formatDistanceToNow(new Date(post.created_at), { addSuffix: true })}
                        </p>
                      </div>
                      {(isAdmin || post.user_id === user?.id) && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive hover:text-destructive"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeletePost(post.id);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-foreground line-clamp-3 mb-3">{post.content}</p>
                    {post.image_url && (
                      <img
                        src={post.image_url}
                        alt="Post image"
                        className="w-full h-48 object-cover rounded-lg mb-3"
                      />
                    )}
                    <div className="flex items-center gap-4 text-muted-foreground">
                      <button
                        className={`flex items-center gap-1 hover:text-accent transition-colors ${post.has_upvoted ? "text-accent" : ""}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleUpvote(post.id, post.has_upvoted || false);
                        }}
                      >
                        <ThumbsUp className={`h-4 w-4 ${post.has_upvoted ? "fill-current" : ""}`} />
                        <span>{post.upvote_count}</span>
                      </button>
                      <div className="flex items-center gap-1">
                        <MessageCircle className="h-4 w-4" />
                        <span>{post.comment_count || 0}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Post Detail Dialog */}
      <Dialog open={!!selectedPost} onOpenChange={(open) => !open && setSelectedPost(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          {selectedPost && (
            <>
              <DialogHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <DialogTitle className="text-xl">{selectedPost.title}</DialogTitle>
                    <p className="text-sm text-muted-foreground mt-1">
                      {selectedPost.author_name} • {formatDistanceToNow(new Date(selectedPost.created_at), { addSuffix: true })}
                    </p>
                  </div>
                  {(isAdmin || selectedPost.user_id === user?.id) && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive hover:text-destructive"
                      onClick={() => handleDeletePost(selectedPost.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </DialogHeader>
              
              <div className="space-y-4">
                <p className="text-foreground whitespace-pre-wrap">{selectedPost.content}</p>
                
                {selectedPost.image_url && (
                  <img
                    src={selectedPost.image_url}
                    alt="Post image"
                    className="w-full rounded-lg"
                  />
                )}

                <div className="flex items-center gap-4 py-2 border-y border-border">
                  <button
                    className={`flex items-center gap-1 hover:text-accent transition-colors ${selectedPost.has_upvoted ? "text-accent" : "text-muted-foreground"}`}
                    onClick={() => handleUpvote(selectedPost.id, selectedPost.has_upvoted || false)}
                  >
                    <ThumbsUp className={`h-4 w-4 ${selectedPost.has_upvoted ? "fill-current" : ""}`} />
                    <span>{selectedPost.upvote_count} likes</span>
                  </button>
                  <div className="flex items-center gap-1 text-muted-foreground">
                    <MessageCircle className="h-4 w-4" />
                    <span>{selectedPost.comment_count || 0} comments</span>
                  </div>
                </div>

                {/* Comments */}
                <div className="space-y-3">
                  <h3 className="font-semibold">Comments</h3>
                  
                  {loadingComments ? (
                    <div className="text-center py-4">
                      <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
                    </div>
                  ) : comments.length === 0 ? (
                    <p className="text-muted-foreground text-sm">No comments yet. Be the first!</p>
                  ) : (
                    <div className="space-y-3">
                      {comments.map((comment) => (
                        <div key={comment.id} className="bg-muted/50 rounded-lg p-3">
                          <div className="flex items-start justify-between">
                            <div>
                              <span className="font-medium text-sm">{comment.author_name}</span>
                              <span className="text-xs text-muted-foreground ml-2">
                                {formatDistanceToNow(new Date(comment.created_at), { addSuffix: true })}
                              </span>
                            </div>
                            {(isAdmin || comment.user_id === user?.id) && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 text-destructive hover:text-destructive"
                                onClick={() => handleDeleteComment(comment.id)}
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            )}
                          </div>
                          <p className="text-sm mt-1">{comment.content}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Add comment */}
                  <div className="flex gap-2 mt-4">
                    <Input
                      placeholder="Add a comment..."
                      value={newComment}
                      onChange={(e) => setNewComment(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleAddComment()}
                      maxLength={500}
                    />
                    <Button
                      onClick={handleAddComment}
                      disabled={submittingComment || !newComment.trim()}
                    >
                      {submittingComment ? <Loader2 className="h-4 w-4 animate-spin" /> : "Post"}
                    </Button>
                  </div>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Footer */}
      <footer className="bg-primary py-4 px-6 text-center">
        <p className="text-primary-foreground/60 text-sm">
          © {new Date().getFullYear()} {tenant.venue_name}. All rights reserved.
        </p>
      </footer>
    </div>
  );
};

export default Clubhouse;
