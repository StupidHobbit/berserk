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

float oval(vec2 p, vec2 c, vec2 r) {
    return 1.0-smoothstep(0.45,1.0,length((p-c)/r));
}
float segment(vec2 p, vec2 a, vec2 b) {
    vec2 v=b-a;
    return length(p-a-v*clamp(dot(p-a,v)/max(dot(v,v),0.000001),0.0,1.0));
}
vec2 branch(float f) {
    return vec2(0.095+0.535*f,0.352-0.170*f-0.022*sin(f*3.141593));
}

void main() {
    vec2 p=vec2(v_uv.x,1.0-v_uv.y);
    vec4 source=texture2D(u_card,v_uv);
    float aa=max(1.0/max(u_resolution.x,1.0),1.0/max(u_resolution.y,1.0));
    float seed=fract(u_seed*0.137);
    float t=u_time;
    float art=smoothstep(0.140,0.151,p.y)*(1.0-smoothstep(0.539,0.549,p.y));
    art*=smoothstep(0.006,0.019,p.x)*(1.0-smoothstep(0.981,0.994,p.x));
    // Preserve the complete printed protection and directed-strike badges.
    art*=smoothstep(1.0,1.13,length((p-vec2(0.110,0.180))/vec2(0.061,0.039)));
    art*=smoothstep(1.0,1.13,length((p-vec2(0.110,0.260))/vec2(0.061,0.039)));
    vec3 color=source.rgb;
    float face=oval(p,vec2(0.643,0.345),vec2(0.069,0.050));

    // The three elm-guards live on the great sweeping branch of her crown.
    // Their charges travel toward the helmet, then feed its defensive halo.
    float vein=0.0;
    float glow=0.0;
    for (int i=0;i<24;i++) {
        float f=float(i)/24.0;
        vec2 a=branch(f);
        vec2 b=branch(f+1.0/24.0);
        float d=segment(p,a,b);
        float charge=pow(0.5+0.5*cos(f*18.849556-t*2.4+seed*6.28),12.0);
        vein=max(vein,(1.0-smoothstep(0.0010,0.0025+aa*0.7,d))*(0.22+0.65*charge));
        glow=max(glow,exp(-d*d/0.00018)*(0.18+0.65*charge));
    }
    color+=vec3(0.25,0.63,0.48)*vein+vec3(0.018,0.15,0.105)*glow;
    for (int i=0;i<3;i++) {
        float fi=float(i);
        float f=0.23+fi*0.25;
        vec2 c=branch(f)+vec2(-0.006,-0.022);
        c.y+=0.003*sin(t*1.7+fi*2.1+seed*6.28);
        vec2 q=(p-c)*vec2(1.0,1.4113);
        float angle=-0.68+0.10*sin(t*0.9+fi);
        q=mat2(cos(angle),-sin(angle),sin(angle),cos(angle))*q;
        // Pointed leaf silhouette with a lit midrib; three visible at t=0.
        float leaf=abs(q.x)/0.013+pow(abs(q.y)/0.025,1.45);
        float body=1.0-smoothstep(0.83,1.05+aa*8.0,leaf);
        float edge=exp(-pow((leaf-0.85)*5.0,2.0));
        float rib=(1.0-smoothstep(0.0007,0.0016+aa*0.5,abs(q.x)))*body;
        float pulse=0.55+0.45*pow(0.5+0.5*sin(t*2.4-fi*2.094+seed*6.28),4.0);
        color+=vec3(0.12,0.52,0.28)*body*(0.40+0.40*pulse);
        color+=vec3(0.44,0.74,0.36)*(edge*0.25+rib*0.60)*pulse;
        color+=vec3(0.025,0.13,0.07)*exp(-dot(q,q)/0.0010)*pulse;
    }

    // A breathing guard follows the open forest behind the raised right arm.
    vec2 halo=(p-vec2(0.637,0.327))*vec2(1.0,1.4113);
    float radius=length(halo);
    float ring=abs(radius-(0.272+0.006*sin(t*1.4+seed*6.28)));
    float forest=smoothstep(0.020,0.13,source.b-source.r);
    float guard=(1.0-smoothstep(0.0015,0.0045+aa,ring));
    float guardGlow=exp(-ring*ring/0.0004);
    float upper=smoothstep(0.310,0.390,p.x);
    color+=vec3(0.065,0.31,0.24)*(guard*0.55+guardGlow*0.21)*forest*upper;

    // Crown seam down the long copper brow: the guardian charges arrive here.
    float seam=segment(p,vec2(0.638,0.183),vec2(0.688,0.331));
    float crown=oval(p,vec2(0.661,0.243),vec2(0.092,0.108));
    float metal=smoothstep(0.07,0.28,source.r-source.b)*crown;
    float beat=0.5+0.5*sin(t*2.4+seed*6.28);
    color+=vec3(0.27,0.18,0.018)*metal*(0.2+0.55*beat);
    color+=vec3(0.27,0.52,0.18)*exp(-seam*seam/0.000018)*(0.20+0.5*beat);
    float flowers=oval(p,vec2(0.280,0.466),vec2(0.270,0.080));
    float pale=smoothstep(0.29,0.61,dot(source.rgb,vec3(0.2126,0.7152,0.0722)));
    color+=vec3(0.035,0.13,0.11)*flowers*pale*(0.6+0.4*sin(p.x*27.0-t*2.0));

    if (u_is_foil) {
        // Copper crown and silver cuirass carry strong metallic interference.
        // The broad spectrum is visible on a still card and at listing scale.
        float armor=oval(p,vec2(0.675,0.443),vec2(0.119,0.060));
        float luma=dot(source.rgb,vec3(0.2126,0.7152,0.0722));
        float phase=p.x*1.8-p.y*3.1+0.07*sin(p.x*25.0+p.y*18.0)+t*0.12+seed*0.22;
        vec3 spectrum=0.5+0.5*cos(6.283185*(phase+vec3(0.0,0.333,0.667)));
        vec3 overlay=mix(2.0*color*spectrum,1.0-2.0*(1.0-color)*(1.0-spectrum),step(vec3(0.5),color));
        color=mix(color,overlay,(0.31+0.18*crown+0.17*armor)*(1.0-face*0.92));
        float shine=pow(0.5+0.5*sin(p.x*17.0-p.y*22.0-t*1.25+seed*4.0),9.0);
        float embossed=clamp(crown+armor+flowers*0.36,0.0,1.0)*smoothstep(0.17,0.65,luma);
        color+=(1.0-color)*mix(vec3(0.92,0.84,0.53),spectrum,0.53)
            *(0.10+0.40*shine)*(0.32+0.90*embossed)*(1.0-face);
    }
    gl_FragColor=vec4(mix(source.rgb,clamp(color,0.0,1.0),art),source.a);
}
