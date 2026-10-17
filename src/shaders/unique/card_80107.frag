#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

uniform sampler2D u_card;
uniform vec2 u_resolution;
uniform float u_time;
uniform float u_seed;
uniform bool u_is_foil;
varying vec2 v_uv;

// Deor: the fallen forest's anger gathers into his raised weapon, then
// escapes as a strong golden strike. Coordinates follow the printed scan.
float oval(vec2 p, vec2 c, vec2 r) {
    return 1.0-smoothstep(0.4,1.0,length((p-c)/r));
}
float lineDistance(vec2 p,vec2 a,vec2 b) {
    vec2 v=b-a;
    return length(p-a-v*clamp(dot(p-a,v)/max(dot(v,v),0.00001),0.0,1.0));
}
vec2 angerPath(float s,float side) {
    vec2 a=mix(vec2(0.075,0.473),vec2(0.940,0.465),side);
    vec2 b=mix(vec2(0.108,0.270),vec2(0.916,0.300),side);
    vec2 c=mix(vec2(0.407,0.179),vec2(0.739,0.223),side);
    return (1.0-s)*(1.0-s)*a+2.0*s*(1.0-s)*b+s*s*c;
}
void main() {
    vec2 p=vec2(v_uv.x,1.0-v_uv.y);
    vec4 scan=texture2D(u_card,v_uv);
    float aa=1.0/max(u_resolution.x,1.0);
    vec2 aspect=vec2(1.0,u_resolution.y/max(u_resolution.x,1.0));
    float t=u_time;
    float seed=fract(u_seed*0.137);
    float art=smoothstep(0.140,0.154,p.y)*(1.0-smoothstep(0.535,0.552,p.y));
    art*=smoothstep(0.008,0.024,p.x)*(1.0-smoothstep(0.977,0.992,p.x));
    // Both printed ability discs and the regeneration counter remain exact.
    art*=clamp(smoothstep(0.181,0.202,p.x)+smoothstep(0.309,0.327,p.y),0.0,1.0);
    if (art<=0.0) { gl_FragColor=scan; return; }
    vec3 color=scan.rgb;
    float face=oval(p,vec2(0.526,0.231),vec2(0.061,0.058));
    float chest=oval(p,vec2(0.537,0.302),vec2(0.109,0.083));
    float charge=0.5+0.5*sin(t*2.35+seed*6.283185);
    color+=vec3(0.20,0.026,0.003)*chest*charge*(1.0-face);

    // Leaf-shaped motes run upstream from both forest flanks toward the hands.
    // Their short tails trace the same curves, so motion reads at listing size.
    float leaves=0.0;
    float tails=0.0;
    for (int i=0;i<20;i++) {
        float fi=float(i);
        float side=step(9.5,fi);
        float age=fract(t*0.21+fi*0.107+seed+side*0.31);
        vec2 c=angerPath(age,side);
        c.x+=0.012*sin(age*14.0+fi*2.3)*sin(age*3.141593);
        vec2 old=angerPath(max(0.0,age-0.065),side);
        old.x+=0.012*sin(max(0.0,age-0.065)*14.0+fi*2.3)*sin(max(0.0,age-0.065)*3.141593);
        vec2 direction=normalize((c-old)*aspect+vec2(0.0001));
        vec2 q=(p-c)*aspect;
        vec2 leaf=vec2(dot(q,direction),dot(q,vec2(-direction.y,direction.x)));
        float size=0.007+0.004*fract(fi*0.618);
        float leafD=abs(leaf.x)*0.55+abs(leaf.y)*1.65;
        float fade=smoothstep(0.0,0.10,age)*(1.0-smoothstep(0.89,1.0,age));
        leaves+=(1.0-smoothstep(size,size+aa*0.75,leafD))*fade;
        float d=lineDistance(p*aspect,old*aspect,c*aspect);
        tails+=(1.0-smoothstep(0.0014,0.003+aa,d))*fade;
    }
    color+=(1.0-color)*vec3(0.94,0.44,0.035)*leaves*0.86;
    color+=vec3(0.33,0.075,0.006)*tails*(1.0-face);

    // A charge runs across the real raised haft into the green axe head.
    vec2 haftA=vec2(0.332,0.160);
    vec2 haftB=vec2(0.762,0.228);
    float shaft=1.0-smoothstep(0.002,0.006+aa,lineDistance(p*aspect,haftA*aspect,haftB*aspect));
    float head=fract(t*0.43+seed);
    float packet=exp(-pow((p.x-(0.335+head*0.425))/0.060,2.0));
    color+=vec3(0.58,0.26,0.026)*shaft*(0.12+0.88*packet);
    float axe=oval(p,vec2(0.751,0.235),vec2(0.062,0.072));
    float green=smoothstep(0.01,0.16,scan.g-scan.r*0.75);
    color+=(1.0-color)*vec3(0.35,0.62,0.12)*axe*green*(0.15+0.70*charge);

    // Strong attack: an amber crescent sweeps down beside the centaur,
    // keeping his face and painted silhouette readable.
    vec2 q=(p-vec2(0.577,0.328))*aspect;
    float theta=atan(q.y,q.x);
    float arcPos=clamp((theta+0.75)/1.75,0.0,1.0);
    float ring=1.0-smoothstep(0.002,0.005+aa,abs(length(q)-0.307));
    float ends=smoothstep(-0.75,-0.58,theta)*(1.0-smoothstep(0.78,1.00,theta));
    float sweep=fract(t*0.32+seed+0.17);
    float gap=fract(sweep-arcPos+1.0);
    float trail=exp(-gap*12.0);
    color+=vec3(0.70,0.30,0.025)*ring*ends*trail;
    float aura=exp(-pow((length(q)-0.307)/0.020,2.0))*ends*trail;
    color+=vec3(0.16,0.038,0.003)*aura;

    if (u_is_foil) {
        // Copper autumn foliage and emerald weapon take a saturated metallic
        // interference coat, visible even when animation time is held at zero.
        float phase=p.x*2.7-p.y*3.9-t*0.16+seed;
        vec3 rainbow=0.5+0.5*cos(6.283185*(phase+vec3(0.0,0.33,0.67)));
        vec3 overlay=mix(2.0*color*rainbow,1.0-2.0*(1.0-color)*(1.0-rainbow),step(vec3(0.5),color));
        color=mix(color,overlay,0.36*(1.0-face*0.83));
        float luma=dot(scan.rgb,vec3(0.2126,0.7152,0.0722));
        float metallic=smoothstep(0.14,0.46,luma)*(1.0-face);
        float sheen=pow(0.5+0.5*sin(phase*6.283185),10.0);
        color+=(1.0-color)*mix(vec3(0.75,0.48,0.15),rainbow,0.65)*metallic*(0.10+0.40*sheen);
        color+=rainbow*axe*green*0.14;
    }
    gl_FragColor=vec4(mix(scan.rgb,clamp(color,0.0,1.0),art),scan.a);
}
