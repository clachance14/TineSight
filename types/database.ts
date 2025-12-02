// TypeScript types for TineSight Supabase database schema
// Generated from: supabase/migrations/001_initial_schema.sql

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          email: string
          full_name: string | null
          avatar_url: string | null
          subscription_tier: string
          stripe_customer_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          email: string
          full_name?: string | null
          avatar_url?: string | null
          subscription_tier?: string
          stripe_customer_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          email?: string
          full_name?: string | null
          avatar_url?: string | null
          subscription_tier?: string
          stripe_customer_id?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      team_members: {
        Row: {
          id: string
          account_id: string
          user_id: string
          role: string
          invited_at: string
          accepted_at: string | null
        }
        Insert: {
          id?: string
          account_id: string
          user_id: string
          role?: string
          invited_at?: string
          accepted_at?: string | null
        }
        Update: {
          id?: string
          account_id?: string
          user_id?: string
          role?: string
          invited_at?: string
          accepted_at?: string | null
        }
      }
      cameras: {
        Row: {
          id: string
          user_id: string
          name: string
          location_lat: number | null
          location_lng: number | null
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          name: string
          location_lat?: number | null
          location_lng?: number | null
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          name?: string
          location_lat?: number | null
          location_lng?: number | null
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      images: {
        Row: {
          id: string
          user_id: string
          camera_id: string | null
          file_path: string
          file_size_bytes: number | null
          captured_at: string | null
          imported_at: string
          detection_status: string
          classification: string | null
          confidence: number | null
          is_archived: boolean
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          camera_id?: string | null
          file_path: string
          file_size_bytes?: number | null
          captured_at?: string | null
          imported_at?: string
          detection_status?: string
          classification?: string | null
          confidence?: number | null
          is_archived?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          camera_id?: string | null
          file_path?: string
          file_size_bytes?: number | null
          captured_at?: string | null
          imported_at?: string
          detection_status?: string
          classification?: string | null
          confidence?: number | null
          is_archived?: boolean
          created_at?: string
        }
      }
      deer: {
        Row: {
          id: string
          user_id: string
          name: string | null
          first_seen: string | null
          last_seen: string | null
          notes: string | null
          tags: string[] | null
          status: string
          harvested_at: string | null
          representative_image_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          name?: string | null
          first_seen?: string | null
          last_seen?: string | null
          notes?: string | null
          tags?: string[] | null
          status?: string
          harvested_at?: string | null
          representative_image_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          name?: string | null
          first_seen?: string | null
          last_seen?: string | null
          notes?: string | null
          tags?: string[] | null
          status?: string
          harvested_at?: string | null
          representative_image_id?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      detections: {
        Row: {
          id: string
          image_id: string
          bbox_x: number | null
          bbox_y: number | null
          bbox_width: number | null
          bbox_height: number | null
          class: string | null
          confidence: number | null
          deer_id: string | null
          created_at: string
        }
        Insert: {
          id?: string
          image_id: string
          bbox_x?: number | null
          bbox_y?: number | null
          bbox_width?: number | null
          bbox_height?: number | null
          class?: string | null
          confidence?: number | null
          deer_id?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          image_id?: string
          bbox_x?: number | null
          bbox_y?: number | null
          bbox_width?: number | null
          bbox_height?: number | null
          class?: string | null
          confidence?: number | null
          deer_id?: string | null
          created_at?: string
        }
      }
      deer_embeddings: {
        Row: {
          id: string
          deer_id: string
          detection_id: string
          embedding: number[]
          created_at: string
        }
        Insert: {
          id?: string
          deer_id: string
          detection_id: string
          embedding: number[]
          created_at?: string
        }
        Update: {
          id?: string
          deer_id?: string
          detection_id?: string
          embedding?: number[]
          created_at?: string
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_account_access: {
        Args: {
          account_owner_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

// Convenience type exports for common usage
export type Profile = Database['public']['Tables']['profiles']['Row']
export type ProfileInsert = Database['public']['Tables']['profiles']['Insert']
export type ProfileUpdate = Database['public']['Tables']['profiles']['Update']

export type TeamMember = Database['public']['Tables']['team_members']['Row']
export type TeamMemberInsert = Database['public']['Tables']['team_members']['Insert']
export type TeamMemberUpdate = Database['public']['Tables']['team_members']['Update']

export type Camera = Database['public']['Tables']['cameras']['Row']
export type CameraInsert = Database['public']['Tables']['cameras']['Insert']
export type CameraUpdate = Database['public']['Tables']['cameras']['Update']

export type Image = Database['public']['Tables']['images']['Row']
export type ImageInsert = Database['public']['Tables']['images']['Insert']
export type ImageUpdate = Database['public']['Tables']['images']['Update']

export type Deer = Database['public']['Tables']['deer']['Row']
export type DeerInsert = Database['public']['Tables']['deer']['Insert']
export type DeerUpdate = Database['public']['Tables']['deer']['Update']

export type Detection = Database['public']['Tables']['detections']['Row']
export type DetectionInsert = Database['public']['Tables']['detections']['Insert']
export type DetectionUpdate = Database['public']['Tables']['detections']['Update']

export type DeerEmbedding = Database['public']['Tables']['deer_embeddings']['Row']
export type DeerEmbeddingInsert = Database['public']['Tables']['deer_embeddings']['Insert']
export type DeerEmbeddingUpdate = Database['public']['Tables']['deer_embeddings']['Update']

// Enum types for constrained fields
export type SubscriptionTier = 'free' | 'pro' | 'ranch'
export type TeamMemberRole = 'owner' | 'viewer'
export type DetectionStatus = 'pending' | 'processing' | 'completed' | 'failed'
export type DeerStatus = 'watching' | 'target' | 'harvested'
