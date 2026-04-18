"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, PenSquare } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PostCard } from "@/components/social/post-card";
import { CommentList } from "@/components/social/comment-list";

interface Post {
  id: string;
  content: string;
  symbol: string | null;
  createdAt: string;
  userId: string;
  authorName: string;
  likeCount: number;
  commentCount: number;
  liked: boolean;
}

interface Comment {
  id: string;
  content: string;
  createdAt: string;
  userId: string;
  authorName: string;
}

export default function PostDetailPage({
  params,
}: {
  params: Promise<{ postId: string }>;
}) {
  const { postId } = use(params);
  const router = useRouter();

  const [post, setPost] = useState<Post | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch(`/api/social/posts/${postId}`);
        if (!res.ok) {
          if (res.status === 404) {
            setError("Post not found");
          } else {
            setError("Failed to load post");
          }
          return;
        }
        const data = await res.json();
        if (!cancelled) {
          setPost(data.post);
          setComments(data.comments);
        }
      } catch {
        if (!cancelled) setError("Network error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [postId]);

  if (loading) {
    return (
      <div className="p-4 lg:p-6 space-y-4">
        <div className="">
          <div className="rounded-xl border border-border bg-bg-surface p-4 animate-pulse h-40" />
        </div>
      </div>
    );
  }

  if (error || !post) {
    return (
      <div className="p-4 lg:p-6">
        <div className=" mb-6">
          <Button
            variant="ghost"
            size="md"
            onClick={() => router.push("/dashboard/posts")}
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Posts
          </Button>
        </div>
        <EmptyState
          icon={<PenSquare className="h-12 w-12" />}
          title={error || "Post not found"}
          description="This post may have been deleted."
          action={{
            label: "Back to Posts",
            onClick: () => router.push("/dashboard/posts"),
          }}
        />
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 space-y-6">
      <div className="">
        <Button
          variant="ghost"
          size="md"
          onClick={() => router.push("/dashboard/posts")}
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Posts
        </Button>
      </div>

      <PostCard
        id={post.id}
        content={post.content}
        symbol={post.symbol}
        createdAt={post.createdAt}
        authorName={post.authorName}
        userId={post.userId}
        likeCount={post.likeCount}
        commentCount={post.commentCount}
        liked={post.liked}
      />

      <Card>
        <h2 className="text-sm font-semibold text-text-primary mb-4">
          Comments ({comments.length})
        </h2>
        <CommentList postId={postId} initialComments={comments} />
      </Card>
    </div>
  );
}
