export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      batch_metrics: {
        Row: {
          batch_id: string
          created_at: string
          duration_ms: number | null
          gemini_call_type: string
          id: string
          image_id: string | null
          is_rate_limited: boolean
          model_used: string
          prompt_tokens: number
          response_tokens: number
          retry_count: number
          total_tokens: number
        }
        Insert: {
          batch_id: string
          created_at?: string
          duration_ms?: number | null
          gemini_call_type: string
          id?: string
          image_id?: string | null
          is_rate_limited?: boolean
          model_used: string
          prompt_tokens?: number
          response_tokens?: number
          retry_count?: number
          total_tokens?: number
        }
        Update: {
          batch_id?: string
          created_at?: string
          duration_ms?: number | null
          gemini_call_type?: string
          id?: string
          image_id?: string | null
          is_rate_limited?: boolean
          model_used?: string
          prompt_tokens?: number
          response_tokens?: number
          retry_count?: number
          total_tokens?: number
        }
        Relationships: [
          {
            foreignKeyName: "batch_metrics_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "processing_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batch_metrics_image_id_fkey"
            columns: ["image_id"]
            isOneToOne: false
            referencedRelation: "images"
            referencedColumns: ["id"]
          },
        ]
      }
      cameras: {
        Row: {
          created_at: string
          device_identifier: string | null
          exif_signature: string | null
          id: string
          location_lat: number | null
          location_lng: number | null
          make: string | null
          model: string | null
          name: string
          notes: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          device_identifier?: string | null
          exif_signature?: string | null
          id?: string
          location_lat?: number | null
          location_lng?: number | null
          make?: string | null
          model?: string | null
          name: string
          notes?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          device_identifier?: string | null
          exif_signature?: string | null
          id?: string
          location_lat?: number | null
          location_lng?: number | null
          make?: string | null
          model?: string | null
          name?: string
          notes?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cameras_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      deer: {
        Row: {
          created_at: string
          first_seen: string | null
          harvested_at: string | null
          id: string
          last_seen: string | null
          name: string | null
          notes: string | null
          reference_detection_id: string | null
          representative_image_id: string | null
          status: string
          tags: string[] | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          first_seen?: string | null
          harvested_at?: string | null
          id?: string
          last_seen?: string | null
          name?: string | null
          notes?: string | null
          reference_detection_id?: string | null
          representative_image_id?: string | null
          status?: string
          tags?: string[] | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          first_seen?: string | null
          harvested_at?: string | null
          id?: string
          last_seen?: string | null
          name?: string | null
          notes?: string | null
          reference_detection_id?: string | null
          representative_image_id?: string | null
          status?: string
          tags?: string[] | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "deer_reference_detection_id_fkey"
            columns: ["reference_detection_id"]
            isOneToOne: false
            referencedRelation: "detections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deer_representative_image_id_fkey"
            columns: ["representative_image_id"]
            isOneToOne: false
            referencedRelation: "images"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deer_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      deer_embeddings: {
        Row: {
          created_at: string
          deer_id: string | null
          detection_id: string
          embedding: string
          id: string
        }
        Insert: {
          created_at?: string
          deer_id?: string | null
          detection_id: string
          embedding: string
          id?: string
        }
        Update: {
          created_at?: string
          deer_id?: string | null
          detection_id?: string
          embedding?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "deer_embeddings_deer_id_fkey"
            columns: ["deer_id"]
            isOneToOne: false
            referencedRelation: "deer"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deer_embeddings_detection_id_fkey"
            columns: ["detection_id"]
            isOneToOne: false
            referencedRelation: "detections"
            referencedColumns: ["id"]
          },
        ]
      }
      detection_rois: {
        Row: {
          created_at: string
          created_by: string | null
          detection_id: string
          id: string
          is_reference: boolean
          roi_height: number
          roi_width: number
          roi_x: number
          roi_y: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          detection_id: string
          id?: string
          is_reference?: boolean
          roi_height: number
          roi_width: number
          roi_x: number
          roi_y: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          detection_id?: string
          id?: string
          is_reference?: boolean
          roi_height?: number
          roi_width?: number
          roi_x?: number
          roi_y?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "detection_rois_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "detection_rois_detection_id_fkey"
            columns: ["detection_id"]
            isOneToOne: true
            referencedRelation: "detections"
            referencedColumns: ["id"]
          },
        ]
      }
      detections: {
        Row: {
          age_class: string | null
          analysis_source: string | null
          antler_bbox: Json | null
          antler_description: string | null
          antler_fingerprint: Json | null
          bbox_height: number | null
          bbox_width: number | null
          bbox_x: number | null
          bbox_y: number | null
          class: string | null
          confidence: number | null
          created_at: string
          crop_file_path: string | null
          deer_id: string | null
          deleted_at: string | null
          detection_class: string | null
          distinguishing_features: string | null
          estimated_point_range: string | null
          gemini_confidence: number | null
          head_bbox: Json | null
          id: string
          image_id: string
          is_reference: boolean | null
          quality_score: number | null
          quality_status: string | null
          sam3_antler_score: number | null
          sam3_deer_score: number | null
          sex: string | null
          is_trophy: boolean
          score_estimate: number | null
          score_estimate_confidence: number | null
          score_gross: number | null
          size_class: string | null
          species: string | null
        }
        Insert: {
          age_class?: string | null
          analysis_source?: string | null
          antler_bbox?: Json | null
          antler_description?: string | null
          antler_fingerprint?: Json | null
          bbox_height?: number | null
          bbox_width?: number | null
          bbox_x?: number | null
          bbox_y?: number | null
          class?: string | null
          confidence?: number | null
          created_at?: string
          crop_file_path?: string | null
          deer_id?: string | null
          deleted_at?: string | null
          detection_class?: string | null
          distinguishing_features?: string | null
          estimated_point_range?: string | null
          gemini_confidence?: number | null
          head_bbox?: Json | null
          id?: string
          image_id: string
          is_reference?: boolean | null
          quality_score?: number | null
          quality_status?: string | null
          sam3_antler_score?: number | null
          sam3_deer_score?: number | null
          sex?: string | null
          is_trophy?: boolean
          score_estimate?: number | null
          score_estimate_confidence?: number | null
          score_gross?: number | null
          size_class?: string | null
          species?: string | null
        }
        Update: {
          age_class?: string | null
          analysis_source?: string | null
          antler_bbox?: Json | null
          antler_description?: string | null
          antler_fingerprint?: Json | null
          bbox_height?: number | null
          bbox_width?: number | null
          bbox_x?: number | null
          bbox_y?: number | null
          class?: string | null
          confidence?: number | null
          created_at?: string
          crop_file_path?: string | null
          deer_id?: string | null
          deleted_at?: string | null
          detection_class?: string | null
          distinguishing_features?: string | null
          estimated_point_range?: string | null
          gemini_confidence?: number | null
          head_bbox?: Json | null
          id?: string
          image_id?: string
          is_reference?: boolean | null
          quality_score?: number | null
          quality_status?: string | null
          sam3_antler_score?: number | null
          sam3_deer_score?: number | null
          sex?: string | null
          is_trophy?: boolean
          score_estimate?: number | null
          score_estimate_confidence?: number | null
          score_gross?: number | null
          size_class?: string | null
          species?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "detections_deer_id_fkey"
            columns: ["deer_id"]
            isOneToOne: false
            referencedRelation: "deer"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "detections_image_id_fkey"
            columns: ["image_id"]
            isOneToOne: false
            referencedRelation: "images"
            referencedColumns: ["id"]
          },
        ]
      }
      filter_presets: {
        Row: {
          created_at: string | null
          filters: Json
          id: string
          is_default: boolean | null
          name: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          filters: Json
          id?: string
          is_default?: boolean | null
          name: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          filters?: Json
          id?: string
          is_default?: boolean | null
          name?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "filter_presets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      images: {
        Row: {
          analysis_notes: string | null
          analyzed_at: string | null
          batch_id: string | null
          blur_data_url: string | null
          camera_id: string | null
          captured_at: string | null
          classification: string | null
          confidence: number | null
          cow_count: number | null
          created_at: string
          deer_count: number | null
          detection_status: string
          error_message: string | null
          exif_data: Json | null
          file_path: string
          file_size_bytes: number | null
          goat_count: number | null
          has_cows: boolean | null
          has_deer: boolean | null
          has_goats: boolean | null
          has_hogs: boolean | null
          has_people: boolean | null
          has_vehicles: boolean | null
          hog_count: number | null
          id: string
          imported_at: string
          is_archived: boolean
          is_cancelled: boolean
          location_id: string | null
          original_filename: string | null
          people_count: number | null
          medium_path: string | null
          retry_count: number
          thumbnail_path: string | null
          user_id: string
          variant_error: string | null
          variant_status: string
          vehicle_count: number | null
        }
        Insert: {
          analysis_notes?: string | null
          analyzed_at?: string | null
          batch_id?: string | null
          blur_data_url?: string | null
          camera_id?: string | null
          captured_at?: string | null
          classification?: string | null
          confidence?: number | null
          cow_count?: number | null
          created_at?: string
          deer_count?: number | null
          detection_status?: string
          error_message?: string | null
          exif_data?: Json | null
          file_path: string
          file_size_bytes?: number | null
          goat_count?: number | null
          has_cows?: boolean | null
          has_deer?: boolean | null
          has_goats?: boolean | null
          has_hogs?: boolean | null
          has_people?: boolean | null
          has_vehicles?: boolean | null
          hog_count?: number | null
          id?: string
          imported_at?: string
          is_archived?: boolean
          is_cancelled?: boolean
          location_id?: string | null
          original_filename?: string | null
          people_count?: number | null
          medium_path?: string | null
          retry_count?: number
          thumbnail_path?: string | null
          user_id: string
          variant_error?: string | null
          variant_status?: string
          vehicle_count?: number | null
        }
        Update: {
          analysis_notes?: string | null
          analyzed_at?: string | null
          batch_id?: string | null
          blur_data_url?: string | null
          camera_id?: string | null
          captured_at?: string | null
          classification?: string | null
          confidence?: number | null
          cow_count?: number | null
          created_at?: string
          deer_count?: number | null
          detection_status?: string
          error_message?: string | null
          exif_data?: Json | null
          file_path?: string
          file_size_bytes?: number | null
          goat_count?: number | null
          has_cows?: boolean | null
          has_deer?: boolean | null
          has_goats?: boolean | null
          has_hogs?: boolean | null
          has_people?: boolean | null
          has_vehicles?: boolean | null
          hog_count?: number | null
          id?: string
          imported_at?: string
          is_archived?: boolean
          is_cancelled?: boolean
          location_id?: string | null
          original_filename?: string | null
          people_count?: number | null
          medium_path?: string | null
          retry_count?: number
          thumbnail_path?: string | null
          user_id?: string
          variant_error?: string | null
          variant_status?: string
          vehicle_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "images_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "processing_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "images_camera_id_fkey"
            columns: ["camera_id"]
            isOneToOne: false
            referencedRelation: "cameras"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "images_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "images_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      locations: {
        Row: {
          color: string | null
          created_at: string
          direction_compass: number | null
          direction_notes: string | null
          id: string
          lat: number
          lng: number
          name: string
          notes: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          direction_compass?: number | null
          direction_notes?: string | null
          id?: string
          lat: number
          lng: number
          name: string
          notes?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          color?: string | null
          created_at?: string
          direction_compass?: number | null
          direction_notes?: string | null
          id?: string
          lat?: number
          lng?: number
          name?: string
          notes?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "locations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      match_candidates: {
        Row: {
          antler_print_similarity: number | null
          candidate_deer_id: string
          created_at: string
          detection_id: string
          gemini_confidence: number | null
          gemini_reasoning: string | null
          id: string
          reviewed_at: string | null
          similarity_score: number
          status: string
        }
        Insert: {
          antler_print_similarity?: number | null
          candidate_deer_id: string
          created_at?: string
          detection_id: string
          gemini_confidence?: number | null
          gemini_reasoning?: string | null
          id?: string
          reviewed_at?: string | null
          similarity_score: number
          status?: string
        }
        Update: {
          antler_print_similarity?: number | null
          candidate_deer_id?: string
          created_at?: string
          detection_id?: string
          gemini_confidence?: number | null
          gemini_reasoning?: string | null
          id?: string
          reviewed_at?: string | null
          similarity_score?: number
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "match_candidates_candidate_deer_id_fkey"
            columns: ["candidate_deer_id"]
            isOneToOne: false
            referencedRelation: "deer"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_candidates_detection_id_fkey"
            columns: ["detection_id"]
            isOneToOne: false
            referencedRelation: "detections"
            referencedColumns: ["id"]
          },
        ]
      }
      processing_batches: {
        Row: {
          area_name: string | null
          cancelled_at: string | null
          completed_at: string | null
          created_at: string
          direction_compass: number | null
          direction_notes: string | null
          error_message: string | null
          failed_images: number
          id: string
          location_id: string | null
          location_lat: number | null
          location_lng: number | null
          processed_images: number
          status: string
          successful_images: number
          total_images: number
          upload_session_id: string | null
          uploaded_images: number
          user_id: string
        }
        Insert: {
          area_name?: string | null
          cancelled_at?: string | null
          completed_at?: string | null
          created_at?: string
          direction_compass?: number | null
          direction_notes?: string | null
          error_message?: string | null
          failed_images?: number
          id?: string
          location_id?: string | null
          location_lat?: number | null
          location_lng?: number | null
          processed_images?: number
          status?: string
          successful_images?: number
          total_images?: number
          upload_session_id?: string | null
          uploaded_images?: number
          user_id: string
        }
        Update: {
          area_name?: string | null
          cancelled_at?: string | null
          completed_at?: string | null
          created_at?: string
          direction_compass?: number | null
          direction_notes?: string | null
          error_message?: string | null
          failed_images?: number
          id?: string
          location_id?: string | null
          location_lat?: number | null
          location_lng?: number | null
          processed_images?: number
          status?: string
          successful_images?: number
          total_images?: number
          upload_session_id?: string | null
          uploaded_images?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "processing_batches_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "processing_batches_upload_session_id_fkey"
            columns: ["upload_session_id"]
            isOneToOne: false
            referencedRelation: "upload_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "processing_batches_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string
          full_name: string | null
          id: string
          stripe_customer_id: string | null
          subscription_tier: string
          trophy_threshold: number
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email: string
          full_name?: string | null
          id: string
          stripe_customer_id?: string | null
          subscription_tier?: string
          trophy_threshold?: number
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          stripe_customer_id?: string | null
          subscription_tier?: string
          trophy_threshold?: number
          updated_at?: string
        }
        Relationships: []
      }
      roi_feedback: {
        Row: {
          created_at: string
          created_by: string | null
          detection_id: string
          feedback_type: string
          id: string
          notes: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          detection_id: string
          feedback_type: string
          id?: string
          notes?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          detection_id?: string
          feedback_type?: string
          id?: string
          notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "roi_feedback_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "roi_feedback_detection_id_fkey"
            columns: ["detection_id"]
            isOneToOne: false
            referencedRelation: "detections"
            referencedColumns: ["id"]
          },
        ]
      }
      showcases: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          title: string
          token: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          title?: string
          token: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          title?: string
          token?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      showcase_bucks: {
        Row: {
          created_at: string
          deer_id: string
          position: number
          showcase_id: string
        }
        Insert: {
          created_at?: string
          deer_id: string
          position?: number
          showcase_id: string
        }
        Update: {
          created_at?: string
          deer_id?: string
          position?: number
          showcase_id?: string
        }
        Relationships: []
      }
      team_members: {
        Row: {
          accepted_at: string | null
          account_id: string
          id: string
          invited_at: string
          role: string
          user_id: string
        }
        Insert: {
          accepted_at?: string | null
          account_id: string
          id?: string
          invited_at?: string
          role?: string
          user_id: string
        }
        Update: {
          accepted_at?: string | null
          account_id?: string
          id?: string
          invited_at?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_members_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      trophy_cluster_members: {
        Row: {
          added_at: string
          cluster_id: string
          detection_id: string
          id: string
          similarity_to_representative: number | null
        }
        Insert: {
          added_at?: string
          cluster_id: string
          detection_id: string
          id?: string
          similarity_to_representative?: number | null
        }
        Update: {
          added_at?: string
          cluster_id?: string
          detection_id?: string
          id?: string
          similarity_to_representative?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "trophy_cluster_members_cluster_id_fkey"
            columns: ["cluster_id"]
            isOneToOne: false
            referencedRelation: "trophy_clusters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trophy_cluster_members_detection_id_fkey"
            columns: ["detection_id"]
            isOneToOne: true
            referencedRelation: "detections"
            referencedColumns: ["id"]
          },
        ]
      }
      trophy_clusters: {
        Row: {
          avg_similarity: number | null
          created_at: string
          created_deer_id: string | null
          id: string
          member_count: number
          min_similarity: number | null
          representative_detection_id: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          avg_similarity?: number | null
          created_at?: string
          created_deer_id?: string | null
          id?: string
          member_count?: number
          min_similarity?: number | null
          representative_detection_id?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          avg_similarity?: number | null
          created_at?: string
          created_deer_id?: string | null
          id?: string
          member_count?: number
          min_similarity?: number | null
          representative_detection_id?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trophy_clusters_created_deer_id_fkey"
            columns: ["created_deer_id"]
            isOneToOne: false
            referencedRelation: "deer"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trophy_clusters_representative_detection_id_fkey"
            columns: ["representative_detection_id"]
            isOneToOne: false
            referencedRelation: "detections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trophy_clusters_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      upload_sessions: {
        Row: {
          cancelled_at: string | null
          completed_at: string | null
          created_at: string
          failed_count: number
          id: string
          processed_count: number
          skipped_count: number
          status: string
          total_batches: number
          total_images: number
          uploaded_count: number
          user_id: string
        }
        Insert: {
          cancelled_at?: string | null
          completed_at?: string | null
          created_at?: string
          failed_count?: number
          id?: string
          processed_count?: number
          skipped_count?: number
          status?: string
          total_batches?: number
          total_images?: number
          uploaded_count?: number
          user_id: string
        }
        Update: {
          cancelled_at?: string | null
          completed_at?: string | null
          created_at?: string
          failed_count?: number
          id?: string
          processed_count?: number
          skipped_count?: number
          status?: string
          total_batches?: number
          total_images?: number
          uploaded_count?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "upload_sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      compute_quality_score: {
        Args: { query_user_id: string; target_detection_id: string }
        Returns: number
      }
      count_reference_rois: { Args: { query_user_id: string }; Returns: number }
      filter_detections_with_images: {
        Args: {
          p_batch_id?: string
          p_has_deer_id?: boolean
          p_limit?: number
          p_offset?: number
          p_point_range?: string
          p_quality_status?: string
          p_sex?: string
          p_size_class?: string
          p_user_id: string
        }
        Returns: {
          age_class: string
          captured_at: string
          crop_file_path: string
          deer_id: string
          deer_name: string
          detection_id: string
          estimated_point_range: string
          file_path: string
          gemini_confidence: number
          image_id: string
          quality_score: number
          quality_status: string
          sex: string
          size_class: string
          species: string
          thumbnail_path: string
        }[]
      }
      find_similar_deer: {
        Args: {
          match_count?: number
          query_embedding: string
          query_user_id: string
          similarity_threshold?: number
        }
        Returns: {
          deer_id: string
          deer_name: string
          detection_id: string
          image_id: string
          image_path: string
          similarity: number
        }[]
      }
      get_deer_catalog: {
        Args: {
          p_cursor_created_at?: string
          p_cursor_id?: string
          p_limit?: number
          p_search?: string
          p_user_id: string
        }
        Returns: {
          created_at: string
          first_seen: string
          id: string
          last_seen: string
          name: string
          notes: string
          reference_detection_id: string
          representative_file_path: string
          representative_image_id: string
          sighting_count: number
          status: string
        }[]
      }
      get_deer_sightings: {
        Args: {
          p_deer_id: string
          p_limit?: number
          p_offset?: number
          p_user_id: string
        }
        Returns: {
          captured_at: string
          detection_id: string
          estimated_point_range: string
          file_path: string
          image_id: string
          size_class: string
          total_count: number
        }[]
      }
      get_pending_matches_summary: {
        Args: { p_user_id: string }
        Returns: {
          captured_at: string
          detection_id: string
          file_path: string
          image_id: string
          pending_count: number
          thumbnail_path: string
        }[]
      }
      get_photo_stats:
        | {
            Args: { p_batch_id?: string; p_user_id: string }
            Returns: {
              analyzed_photos: number
              basket_count: number
              buck_count: number
              doe_count: number
              empty_photos: number
              failed_photos: number
              pending_photos: number
              photos_with_deer: number
              processing_photos: number
              spike_count: number
              standard_count: number
              total_photos: number
              trophy_count: number
              unknown_count: number
              unknown_size_count: number
            }[]
          }
        | {
            Args: {
              p_batch_id?: string
              p_upload_session_id?: string
              p_user_id: string
            }
            Returns: {
              analyzed_photos: number
              basket_count: number
              buck_count: number
              doe_count: number
              empty_photos: number
              failed_photos: number
              pending_photos: number
              photos_with_deer: number
              processing_photos: number
              spike_count: number
              standard_count: number
              total_photos: number
              trophy_count: number
              unknown_count: number
              unknown_size_count: number
            }[]
          }
      get_unassigned_trophy_detections: {
        Args: { p_user_id: string }
        Returns: {
          captured_at: string
          crop_file_path: string
          detection_id: string
          fingerprint: Json
        }[]
      }
      get_public_showcase: {
        Args: { p_token: string }
        Returns: {
          showcase_title: string
          deer_id: string
          buck_name: string
          score_gross: number | null
          is_trophy: boolean
          image_path: string | null
          sighting_count: number
          buck_position: number
        }[]
      }
      has_account_access: {
        Args: { account_owner_id: string }
        Returns: boolean
      }
      increment_batch_counters: {
        Args: {
          batch_id: string
          increment_failed?: number
          increment_processed?: number
          increment_successful?: number
        }
        Returns: undefined
      }
      increment_session_counters: {
        Args: {
          increment_failed?: number
          increment_processed?: number
          session_id: string
        }
        Returns: undefined
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

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const

// Convenience type aliases for common table types
export type Image = Database['public']['Tables']['images']['Row']
export type ImageInsert = Database['public']['Tables']['images']['Insert']
export type ImageUpdate = Database['public']['Tables']['images']['Update']

export type Detection = Database['public']['Tables']['detections']['Row']
export type DetectionInsert = Database['public']['Tables']['detections']['Insert']
export type DetectionUpdate = Database['public']['Tables']['detections']['Update']

export type Profile = Database['public']['Tables']['profiles']['Row']
export type ProfileInsert = Database['public']['Tables']['profiles']['Insert']
export type ProfileUpdate = Database['public']['Tables']['profiles']['Update']

export type ProcessingBatch = Database['public']['Tables']['processing_batches']['Row']
export type ProcessingBatchInsert = Database['public']['Tables']['processing_batches']['Insert']
export type ProcessingBatchUpdate = Database['public']['Tables']['processing_batches']['Update']

export type Deer = Database['public']['Tables']['deer']['Row']
export type DeerInsert = Database['public']['Tables']['deer']['Insert']
export type DeerUpdate = Database['public']['Tables']['deer']['Update']

export type DeerEmbedding = Database['public']['Tables']['deer_embeddings']['Row']
export type DeerEmbeddingInsert = Database['public']['Tables']['deer_embeddings']['Insert']
export type DeerEmbeddingUpdate = Database['public']['Tables']['deer_embeddings']['Update']

export type Showcase = Database['public']['Tables']['showcases']['Row']
export type ShowcaseInsert = Database['public']['Tables']['showcases']['Insert']
export type ShowcaseUpdate = Database['public']['Tables']['showcases']['Update']

export type ShowcaseBuck = Database['public']['Tables']['showcase_bucks']['Row']
export type ShowcaseBuckInsert = Database['public']['Tables']['showcase_bucks']['Insert']
