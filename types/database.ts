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
          size_class: string | null
          species: string | null
        }
        Insert: {
          age_class?: string | null
          analysis_source?: string | null
          antler_bbox?: Json | null
          antler_description?: string | null
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
          size_class?: string | null
          species?: string | null
        }
        Update: {
          age_class?: string | null
          analysis_source?: string | null
          antler_bbox?: Json | null
          antler_description?: string | null
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
          camera_id: string | null
          captured_at: string | null
          classification: string | null
          confidence: number | null
          created_at: string
          deer_count: number | null
          detection_status: string
          error_message: string | null
          exif_data: Json | null
          file_path: string
          file_size_bytes: number | null
          has_deer: boolean | null
          id: string
          imported_at: string
          is_archived: boolean
          retry_count: number
          thumbnail_path: string | null
          user_id: string
        }
        Insert: {
          analysis_notes?: string | null
          analyzed_at?: string | null
          batch_id?: string | null
          camera_id?: string | null
          captured_at?: string | null
          classification?: string | null
          confidence?: number | null
          created_at?: string
          deer_count?: number | null
          detection_status?: string
          error_message?: string | null
          exif_data?: Json | null
          file_path: string
          file_size_bytes?: number | null
          has_deer?: boolean | null
          id?: string
          imported_at?: string
          is_archived?: boolean
          retry_count?: number
          thumbnail_path?: string | null
          user_id: string
        }
        Update: {
          analysis_notes?: string | null
          analyzed_at?: string | null
          batch_id?: string | null
          camera_id?: string | null
          captured_at?: string | null
          classification?: string | null
          confidence?: number | null
          created_at?: string
          deer_count?: number | null
          detection_status?: string
          error_message?: string | null
          exif_data?: Json | null
          file_path?: string
          file_size_bytes?: number | null
          has_deer?: boolean | null
          id?: string
          imported_at?: string
          is_archived?: boolean
          retry_count?: number
          thumbnail_path?: string | null
          user_id?: string
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
            foreignKeyName: "images_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      match_candidates: {
        Row: {
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
          completed_at: string | null
          created_at: string
          error_message: string | null
          failed_images: number
          id: string
          processed_images: number
          status: string
          successful_images: number
          total_images: number
          uploaded_images: number
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          failed_images?: number
          id?: string
          processed_images?: number
          status?: string
          successful_images?: number
          total_images?: number
          uploaded_images?: number
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          failed_images?: number
          id?: string
          processed_images?: number
          status?: string
          successful_images?: number
          total_images?: number
          uploaded_images?: number
          user_id?: string
        }
        Relationships: [
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
