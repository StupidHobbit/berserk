// Finish every edition with the same view-dependent surface lighting.
uniform vec4 u_surface_pose;
void main() {
    card_effect_main();
    float sx=sin(u_surface_pose.x),cx=cos(u_surface_pose.x);
    float sy=sin(u_surface_pose.y),cy=cos(u_surface_pose.y);
    vec3 normal=vec3(sy,-sx*cy,cx*cy);
    vec3 light=normalize(vec3(-0.4,0.6,1.7));
    vec3 view=normalize(vec3((0.5-v_uv)*0.35,1.0));
    float diffuse=max(dot(normal,light),0.0);
    float specular=pow(max(dot(normal,normalize(light+view)),0.0),48.0);
    frag_color.rgb*=0.92+0.08*diffuse;
    frag_color.rgb+=vec3(1.0,0.95,0.83)*specular*(0.018+0.10*u_surface_pose.w)*frag_color.a;
    frag_color*=card_coverage(v_uv);
}
