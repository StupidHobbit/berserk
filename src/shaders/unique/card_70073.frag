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

// Гару: the painted moon in his raised hand charges his wolf form.
// Three traveling moon crescents skim the snow: the full-moon leap, range 3.
float oval(vec2 p, vec2 c, vec2 r) {
    return 1.0-smoothstep(0.15,1.0,length((p-c)/r));
}
void main() {
    vec2 p=vec2(v_uv.x,1.0-v_uv.y);
    vec4 scan=texture2D(u_card,v_uv);
    float aa=max(1.0/max(u_resolution.x,1.0),1.41129/max(u_resolution.y,1.0));
    float seed=fract(u_seed*0.137);
    float t=max(u_time,0.0);
    float clock=t+seed*1.9;
    float art=smoothstep(0.140,0.151,p.y)*(1.0-smoothstep(0.550,0.562,p.y));
    art*=smoothstep(0.008,0.020,p.x)*(1.0-smoothstep(0.980,0.991,p.x));
    // Shield, strength, sword and small numeral form one protected column.
    art*=clamp(smoothstep(0.174,0.195,p.x)+smoothstep(0.382,0.397,p.y),0.0,1.0);
    vec3 color=scan.rgb;
    float lum=dot(scan.rgb,vec3(0.2126,0.7152,0.0722));
    vec2 moon=vec2(0.797,0.184);
    vec2 mq=(p-moon)*vec2(1.0,1.41129);
    float md=length(mq);
    float breath=0.5+0.5*sin(clock*1.50);
    float moonDisk=1.0-smoothstep(0.035,0.056,md);
    float halo=exp(-md*md/0.0050);
    // Amber illumination remains centered on the orb, never on the card frame.
    color+=(1.0-color)*vec3(1.0,0.67,0.20)*halo*(0.16+0.24*breath);
    color+=(1.0-color)*vec3(1.0,0.90,0.57)*moonDisk*(0.30+0.45*breath);
    float upperSky=1.0-smoothstep(0.206,0.240,p.y);
    float corona=0.0;
    for(int i=0;i<3;i++) {
        float k=float(i);
        float f=fract(clock*0.20+k/3.0);
        float radius=0.043+f*0.085;
        float d=abs(md-radius);
        float fade=sin(f*3.14159265);
        corona+=(1.0-smoothstep(0.001,0.003+aa,d))*fade*fade;
    }
    color+=vec3(0.73,0.52,0.19)*corona*upperSky*0.36;

    // Light flows from the fingers down the visible arm into the wolf's chest.
    float arm=oval(p,vec2(0.660,0.290),vec2(0.196,0.067));
    float shoulder=oval(p,vec2(0.447,0.315),vec2(0.156,0.095));
    float chest=oval(p,vec2(0.380,0.367),vec2(0.122,0.103));
    float palm=oval(p,vec2(0.783,0.232),vec2(0.083,0.058));
    float fur=clamp(arm+shoulder+chest,0.0,1.0);
    float coatInk=smoothstep(0.11,0.46,lum);
    float wave=pow(0.5+0.5*sin(p.x*17.0-p.y*11.0+clock*1.50),5.0);
    color+=(1.0-color)*vec3(0.61,0.64,0.48)*fur*coatInk*(0.06+0.37*wave);
    color+=(1.0-color)*vec3(0.97,0.66,0.22)*palm*(0.09+0.22*breath);
    // Small stationary eye catches keep the wolf's expression readable.
    float eye=oval(p,vec2(0.493,0.223),vec2(0.012,0.0055));
    color+=vec3(0.92,0.64,0.19)*eye*(0.45+0.50*breath);

    // Crescent wakes run across the snow beneath the crouched figure, with
    // three distinct landing positions. Their clipped arcs never enter stats.
    float leaps=0.0;
    for(int i=0;i<3;i++) {
        float k=float(i);
        vec2 landing=vec2(0.236+k*0.274,0.538-k*0.010);
        float phase=fract(clock*0.19-k*0.22);
        float r=0.034+phase*0.059;
        vec2 q=(p-landing)*vec2(1.0,3.2);
        float d=abs(length(q)-r);
        float crescent=smoothstep(-0.014,0.018,q.y);
        float life=sin(phase*3.14159265);
        leaps+=(1.0-smoothstep(0.0015,0.0035+aa*1.3,d))*crescent*life*life;
    }
    color+=vec3(0.30,0.61,0.67)*leaps*0.55;
    float ice=oval(p,vec2(0.753,0.465),vec2(0.201,0.109))
             +oval(p,vec2(0.100,0.487),vec2(0.140,0.080));
    float blueIce=smoothstep(0.02,0.19,scan.b-scan.r)*smoothstep(0.17,0.62,lum)*clamp(ice,0.0,1.0);
    color+=(1.0-color)*vec3(0.27,0.61,0.75)*blueIce*(0.10+0.22*breath);

    if(u_is_foil) {
        // Moon-silver metal follows the painted fur and ice. Broad spectral
        // bands and a polished crescent are visible even with time frozen.
        float phase=p.x*1.85+p.y*2.20+0.12*sin(p.x*11.0-p.y*20.0)-t*0.09+seed*0.20;
        vec3 spectrum=0.5+0.5*cos(6.2831853*(phase+vec3(0.0,0.333,0.667)));
        float face=oval(p,vec2(0.452,0.232),vec2(0.115,0.065));
        vec3 coated=mix(2.0*color*spectrum,
                        1.0-2.0*(1.0-color)*(1.0-spectrum),step(vec3(0.5),color));
        color=mix(color,coated,(0.30+0.16*fur+0.12*blueIce)*(1.0-face*0.65));
        float sheen=pow(0.5+0.5*sin(p.x*14.0+p.y*21.0-t*1.05),8.0);
        float silver=clamp(0.22+fur*coatInk*0.72+blueIce*0.68,0.0,1.0)*(1.0-face*0.60);
        color+=(1.0-color)*mix(vec3(0.69,0.86,0.97),spectrum,0.47)*silver*(0.15+0.46*sheen);
        float rim=1.0-smoothstep(0.0015,0.004+aa,abs(md-0.049));
        color+=(1.0-color)*mix(vec3(1.0,0.83,0.34),spectrum,0.35)*rim*0.72;
        color+=(1.0-color)*spectrum*blueIce*0.18;
    }
    gl_FragColor=vec4(mix(scan.rgb,clamp(color,0.0,1.0),art),scan.a);
}
