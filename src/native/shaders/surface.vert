out vec2 v_uv;
uniform vec4 u_surface_pose; // pitch, yaw, lift in points, hover amount
uniform vec2 u_surface_size;
uniform vec2 u_surface_viewport;
void main() {
    vec2 p=vec2((gl_VertexID==1||gl_VertexID==4||gl_VertexID==5)?1.0:-1.0,
                (gl_VertexID>=2&&gl_VertexID!=4)?1.0:-1.0);
    v_uv=p*0.5+0.5;
    vec3 v=vec3(p*u_surface_size*0.5,0.0);
    float sx=sin(u_surface_pose.x),cx=cos(u_surface_pose.x);
    float sy=sin(u_surface_pose.y),cy=cos(u_surface_pose.y);
    v=vec3(cy*v.x,v.y,-sy*v.x);
    v=vec3(v.x,cx*v.y-sx*v.z,sx*v.y+cx*v.z);
    float w=1.0-v.z/(u_surface_size.x*4.0);
    gl_Position=vec4(2.0*vec2(v.x,v.y+u_surface_pose.z*w)/u_surface_viewport,0.0,w);
}
